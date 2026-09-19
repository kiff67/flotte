import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import type { Transaction } from "mssql";
import { query, txQuery, withTransaction } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../utils.js";

export const interventionsRouter = Router();
interventionsRouter.use(requireAuth);

const partSchema = z.object({
  nom: z.string().min(1),
  reference: z.string().optional(),
  quantite: z.number().positive().default(1),
  prix_unitaire: z.number().nonnegative().optional(),
});

const interventionSchema = z.object({
  boat_id: z.string().min(1),
  date_intervention: z.string().min(1),
  heures_moteur: z.number().nonnegative(),
  duree_heures: z.number().nonnegative(),
  description: z.string().min(1),
  pieces: z.array(partSchema).default([]),
});

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// mssql renvoie les colonnes DATE sous forme d'objets Date (sérialisés en ISO complet avec heure/Z) ;
// on les ramène au format YYYY-MM-DD attendu par le frontend (<input type="date">).
function normalizeDate<T extends { date_intervention: unknown }>(row: T): T {
  const value = row.date_intervention;
  if (value instanceof Date) {
    return { ...row, date_intervention: value.toISOString().slice(0, 10) };
  }
  if (typeof value === "string") {
    return { ...row, date_intervention: value.slice(0, 10) };
  }
  return row;
}

async function upsertCatalogDescription(tx: Transaction, texte: string) {
  const trimmed = texte.trim();
  if (!trimmed) return;
  const existing = await txQuery<{ id: string }>(tx, "SELECT id FROM dbo.description_catalog WHERE texte = @texte", {
    texte: trimmed,
  });
  if (existing[0]) {
    await txQuery(tx, "UPDATE dbo.description_catalog SET usage_count = usage_count + 1 WHERE id = @id", {
      id: existing[0].id,
    });
  } else {
    await txQuery(tx, "INSERT INTO dbo.description_catalog (id, texte, usage_count) VALUES (@id, @texte, 1)", {
      id: uuid(),
      texte: trimmed,
    });
  }
}

async function upsertCatalogPart(
  tx: Transaction,
  nom: string,
  reference: string | undefined,
  prixUnitaire: number | undefined
) {
  const trimmed = nom.trim();
  if (!trimmed) return;
  const existing = await txQuery<{ id: string; prix_unitaire_defaut: number | null }>(
    tx,
    "SELECT id, prix_unitaire_defaut FROM dbo.parts_catalog WHERE nom = @nom",
    { nom: trimmed }
  );
  if (existing[0]) {
    await txQuery(
      tx,
      `UPDATE dbo.parts_catalog
       SET usage_count = usage_count + 1,
           reference = COALESCE(@reference, reference),
           prix_unitaire_defaut = COALESCE(@prix_unitaire, prix_unitaire_defaut)
       WHERE id = @id`,
      { reference: reference ?? null, prix_unitaire: prixUnitaire ?? null, id: existing[0].id }
    );
  } else {
    await txQuery(
      tx,
      `INSERT INTO dbo.parts_catalog (id, nom, reference, prix_unitaire_defaut, usage_count)
       VALUES (@id, @nom, @reference, @prix_unitaire, 1)`,
      { id: uuid(), nom: trimmed, reference: reference ?? null, prix_unitaire: prixUnitaire ?? null }
    );
  }
}

async function fetchIntervention(id: string) {
  const rows = await query(
    `SELECT i.*, b.name AS boat_name, u.name AS technician_name, v.name AS validated_by_name
     FROM dbo.interventions i
     JOIN dbo.boats b ON b.id = i.boat_id
     JOIN dbo.users u ON u.id = i.technician_id
     LEFT JOIN dbo.users v ON v.id = i.validated_by
     WHERE i.id = @id`,
    { id }
  );
  const intervention = rows[0];
  if (!intervention) return null;
  const pieces = await query("SELECT * FROM dbo.intervention_parts WHERE intervention_id = @id", { id });
  return { ...normalizeDate(intervention as { date_intervention: unknown }), pieces };
}

// GET /interventions?statut=en_attente&boat_id=...&mine=1
interventionsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { statut, boat_id, mine } = req.query as Record<string, string | undefined>;
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (statut) {
      clauses.push("i.statut = @statut");
      params.statut = statut;
    }
    if (boat_id) {
      clauses.push("i.boat_id = @boat_id");
      params.boat_id = boat_id;
    }
    if (mine === "1" || req.user!.role === "technicien") {
      clauses.push("i.technician_id = @technician_id");
      params.technician_id = req.user!.id;
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await query(
      `SELECT i.*, b.name AS boat_name, u.name AS technician_name
       FROM dbo.interventions i
       JOIN dbo.boats b ON b.id = i.boat_id
       JOIN dbo.users u ON u.id = i.technician_id
       ${where}
       ORDER BY i.date_intervention DESC, i.created_at DESC`,
      params
    );
    res.json(rows.map((r) => normalizeDate(r as { date_intervention: unknown })));
  })
);

interventionsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const intervention = (await fetchIntervention(req.params.id)) as { technician_id: string } | null;
    if (!intervention) return res.status(404).json({ error: "Intervention introuvable" });
    if (req.user!.role === "technicien" && intervention.technician_id !== req.user!.id) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    res.json(intervention);
  })
);

interventionsRouter.post(
  "/",
  requireRole("technicien", "admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = interventionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const d = parsed.data;

    const boatRows = await query("SELECT id FROM dbo.boats WHERE id = @id", { id: d.boat_id });
    if (!boatRows[0]) return res.status(404).json({ error: "Bateau introuvable" });

    const id = uuid();
    await withTransaction(async (tx) => {
      await txQuery(
        tx,
        `INSERT INTO dbo.interventions (id, boat_id, technician_id, date_intervention, heures_moteur, duree_heures, description, statut)
         VALUES (@id, @boat_id, @technician_id, @date_intervention, @heures_moteur, @duree_heures, @description, 'en_attente')`,
        {
          id,
          boat_id: d.boat_id,
          technician_id: req.user!.id,
          date_intervention: d.date_intervention,
          heures_moteur: d.heures_moteur,
          duree_heures: d.duree_heures,
          description: d.description.trim(),
        }
      );

      for (const piece of d.pieces) {
        await txQuery(
          tx,
          `INSERT INTO dbo.intervention_parts (id, intervention_id, nom, reference, quantite, prix_unitaire)
           VALUES (@id, @intervention_id, @nom, @reference, @quantite, @prix_unitaire)`,
          {
            id: uuid(),
            intervention_id: id,
            nom: piece.nom.trim(),
            reference: piece.reference ?? null,
            quantite: piece.quantite,
            prix_unitaire: piece.prix_unitaire ?? null,
          }
        );
        await upsertCatalogPart(tx, piece.nom, piece.reference, piece.prix_unitaire);
      }

      await upsertCatalogDescription(tx, d.description);

      await txQuery(
        tx,
        `UPDATE dbo.boats
         SET heures_moteur_actuelles = CASE WHEN heures_moteur_actuelles < @heures_moteur THEN @heures_moteur ELSE heures_moteur_actuelles END
         WHERE id = @boat_id`,
        { heures_moteur: d.heures_moteur, boat_id: d.boat_id }
      );
    });

    res.status(201).json(await fetchIntervention(id));
  })
);

const updateSchema = interventionSchema.partial();

interventionsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existingRows = await query<{ id: string; technician_id: string; statut: string }>(
      "SELECT * FROM dbo.interventions WHERE id = @id",
      { id: req.params.id }
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: "Intervention introuvable" });
    if (req.user!.role === "technicien") {
      if (existing.technician_id !== req.user!.id) return res.status(403).json({ error: "Accès refusé" });
      if (existing.statut !== "en_attente") {
        return res.status(400).json({ error: "Une intervention déjà traitée ne peut plus être modifiée" });
      }
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const d = parsed.data;

    await withTransaction(async (tx) => {
      if (d.boat_id) await txQuery(tx, "UPDATE dbo.interventions SET boat_id = @boat_id WHERE id = @id", { boat_id: d.boat_id, id: req.params.id });
      if (d.date_intervention)
        await txQuery(tx, "UPDATE dbo.interventions SET date_intervention = @date_intervention WHERE id = @id", {
          date_intervention: d.date_intervention,
          id: req.params.id,
        });
      if (d.heures_moteur !== undefined)
        await txQuery(tx, "UPDATE dbo.interventions SET heures_moteur = @heures_moteur WHERE id = @id", {
          heures_moteur: d.heures_moteur,
          id: req.params.id,
        });
      if (d.duree_heures !== undefined)
        await txQuery(tx, "UPDATE dbo.interventions SET duree_heures = @duree_heures WHERE id = @id", {
          duree_heures: d.duree_heures,
          id: req.params.id,
        });
      if (d.description)
        await txQuery(tx, "UPDATE dbo.interventions SET description = @description WHERE id = @id", {
          description: d.description.trim(),
          id: req.params.id,
        });
      if (d.pieces) {
        await txQuery(tx, "DELETE FROM dbo.intervention_parts WHERE intervention_id = @id", { id: req.params.id });
        for (const piece of d.pieces) {
          await txQuery(
            tx,
            `INSERT INTO dbo.intervention_parts (id, intervention_id, nom, reference, quantite, prix_unitaire)
             VALUES (@id, @intervention_id, @nom, @reference, @quantite, @prix_unitaire)`,
            {
              id: uuid(),
              intervention_id: req.params.id,
              nom: piece.nom.trim(),
              reference: piece.reference ?? null,
              quantite: piece.quantite,
              prix_unitaire: piece.prix_unitaire ?? null,
            }
          );
          await upsertCatalogPart(tx, piece.nom, piece.reference, piece.prix_unitaire);
        }
      }
      await txQuery(tx, "UPDATE dbo.interventions SET updated_at = SYSUTCDATETIME() WHERE id = @id", { id: req.params.id });
    });

    res.json(await fetchIntervention(req.params.id));
  })
);

interventionsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existingRows = await query<{ technician_id: string; statut: string }>(
      "SELECT * FROM dbo.interventions WHERE id = @id",
      { id: req.params.id }
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: "Intervention introuvable" });
    if (req.user!.role === "technicien") {
      if (existing.technician_id !== req.user!.id || existing.statut !== "en_attente") {
        return res.status(403).json({ error: "Accès refusé" });
      }
    }
    await query("DELETE FROM dbo.interventions WHERE id = @id", { id: req.params.id });
    res.status(204).end();
  })
);

const validationSchema = z.object({
  valeur: z.number().nonnegative(),
  commentaire_validation: z.string().optional(),
});

interventionsRouter.post(
  "/:id/valider",
  requireRole("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = validationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const existing = await query("SELECT id FROM dbo.interventions WHERE id = @id", { id: req.params.id });
    if (!existing[0]) return res.status(404).json({ error: "Intervention introuvable" });

    await query(
      `UPDATE dbo.interventions
       SET statut = 'validee', valeur = @valeur, commentaire_validation = @commentaire_validation,
           validated_by = @validated_by, validated_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        valeur: parsed.data.valeur,
        commentaire_validation: parsed.data.commentaire_validation ?? null,
        validated_by: req.user!.id,
        id: req.params.id,
      }
    );

    res.json(await fetchIntervention(req.params.id));
  })
);

const rejectSchema = z.object({
  commentaire_validation: z.string().min(1, "Merci d'indiquer le motif du refus"),
});

interventionsRouter.post(
  "/:id/rejeter",
  requireRole("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const existing = await query("SELECT id FROM dbo.interventions WHERE id = @id", { id: req.params.id });
    if (!existing[0]) return res.status(404).json({ error: "Intervention introuvable" });

    await query(
      `UPDATE dbo.interventions
       SET statut = 'rejetee', commentaire_validation = @commentaire_validation,
           validated_by = @validated_by, validated_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { commentaire_validation: parsed.data.commentaire_validation, validated_by: req.user!.id, id: req.params.id }
    );

    res.json(await fetchIntervention(req.params.id));
  })
);

// Suggestions pour l'auto-complétion pendant la saisie
interventionsRouter.get(
  "/suggestions/descriptions",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const rows = await query<{ texte: string }>(
      `SELECT TOP 8 texte FROM dbo.description_catalog
       WHERE texte LIKE @q ESCAPE '\\'
       ORDER BY usage_count DESC, texte ASC`,
      { q: `%${escapeLike(q)}%` }
    );
    res.json(rows.map((r) => r.texte));
  })
);

interventionsRouter.get(
  "/suggestions/pieces",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const rows = await query(
      `SELECT TOP 8 nom, reference, prix_unitaire_defaut FROM dbo.parts_catalog
       WHERE nom LIKE @q ESCAPE '\\'
       ORDER BY usage_count DESC, nom ASC`,
      { q: `%${escapeLike(q)}%` }
    );
    res.json(rows);
  })
);
