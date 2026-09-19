import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../auth.js";

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
  description: z.string().min(1),
  pieces: z.array(partSchema).default([]),
});

function upsertCatalogDescription(texte: string) {
  const trimmed = texte.trim();
  if (!trimmed) return;
  const existing = db.prepare("SELECT id FROM description_catalog WHERE texte = ?").get(trimmed) as
    | { id: string }
    | undefined;
  if (existing) {
    db.prepare("UPDATE description_catalog SET usage_count = usage_count + 1 WHERE id = ?").run(existing.id);
  } else {
    db.prepare("INSERT INTO description_catalog (id, texte, usage_count) VALUES (?, ?, 1)").run(uuid(), trimmed);
  }
}

function upsertCatalogPart(nom: string, reference: string | undefined, prixUnitaire: number | undefined) {
  const trimmed = nom.trim();
  if (!trimmed) return;
  const existing = db.prepare("SELECT id, prix_unitaire_defaut FROM parts_catalog WHERE nom = ?").get(trimmed) as
    | { id: string; prix_unitaire_defaut: number | null }
    | undefined;
  if (existing) {
    db.prepare(
      "UPDATE parts_catalog SET usage_count = usage_count + 1, reference = COALESCE(?, reference), prix_unitaire_defaut = COALESCE(?, prix_unitaire_defaut) WHERE id = ?"
    ).run(reference ?? null, prixUnitaire ?? null, existing.id);
  } else {
    db.prepare(
      "INSERT INTO parts_catalog (id, nom, reference, prix_unitaire_defaut, usage_count) VALUES (?, ?, ?, ?, 1)"
    ).run(uuid(), trimmed, reference ?? null, prixUnitaire ?? null);
  }
}

function fetchIntervention(id: string) {
  const intervention = db
    .prepare(
      `SELECT i.*, b.name AS boat_name, u.name AS technician_name, v.name AS validated_by_name
       FROM interventions i
       JOIN boats b ON b.id = i.boat_id
       JOIN users u ON u.id = i.technician_id
       LEFT JOIN users v ON v.id = i.validated_by
       WHERE i.id = ?`
    )
    .get(id);
  if (!intervention) return null;
  const pieces = db.prepare("SELECT * FROM intervention_parts WHERE intervention_id = ?").all(id);
  return { ...intervention, pieces };
}

// GET /interventions?statut=en_attente&boat_id=...&mine=1
interventionsRouter.get("/", (req: AuthedRequest, res) => {
  const { statut, boat_id, mine } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (statut) {
    clauses.push("i.statut = ?");
    params.push(statut);
  }
  if (boat_id) {
    clauses.push("i.boat_id = ?");
    params.push(boat_id);
  }
  if (mine === "1" || req.user!.role === "technicien") {
    clauses.push("i.technician_id = ?");
    params.push(req.user!.id);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT i.*, b.name AS boat_name, u.name AS technician_name
       FROM interventions i
       JOIN boats b ON b.id = i.boat_id
       JOIN users u ON u.id = i.technician_id
       ${where}
       ORDER BY i.date_intervention DESC, i.created_at DESC`
    )
    .all(...params);
  res.json(rows);
});

interventionsRouter.get("/:id", (req: AuthedRequest, res) => {
  const intervention = fetchIntervention(req.params.id) as { technician_id: string } | null;
  if (!intervention) return res.status(404).json({ error: "Intervention introuvable" });
  if (req.user!.role === "technicien" && intervention.technician_id !== req.user!.id) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  res.json(intervention);
});

interventionsRouter.post("/", requireRole("technicien", "admin"), (req: AuthedRequest, res) => {
  const parsed = interventionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;

  const boat = db.prepare("SELECT * FROM boats WHERE id = ?").get(d.boat_id);
  if (!boat) return res.status(404).json({ error: "Bateau introuvable" });

  const id = uuid();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO interventions (id, boat_id, technician_id, date_intervention, heures_moteur, description, statut)
       VALUES (?, ?, ?, ?, ?, ?, 'en_attente')`
    ).run(id, d.boat_id, req.user!.id, d.date_intervention, d.heures_moteur, d.description.trim());

    for (const piece of d.pieces) {
      db.prepare(
        `INSERT INTO intervention_parts (id, intervention_id, nom, reference, quantite, prix_unitaire)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuid(), id, piece.nom.trim(), piece.reference ?? null, piece.quantite, piece.prix_unitaire ?? null);
      upsertCatalogPart(piece.nom, piece.reference, piece.prix_unitaire);
    }

    upsertCatalogDescription(d.description);

    db.prepare(
      "UPDATE boats SET heures_moteur_actuelles = MAX(heures_moteur_actuelles, ?) WHERE id = ?"
    ).run(d.heures_moteur, d.boat_id);
  });
  tx();

  res.status(201).json(fetchIntervention(id));
});

const updateSchema = interventionSchema.partial();

interventionsRouter.patch("/:id", (req: AuthedRequest, res) => {
  const existing = db.prepare("SELECT * FROM interventions WHERE id = ?").get(req.params.id) as
    | { id: string; technician_id: string; statut: string }
    | undefined;
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

  const tx = db.transaction(() => {
    if (d.boat_id) db.prepare("UPDATE interventions SET boat_id = ? WHERE id = ?").run(d.boat_id, req.params.id);
    if (d.date_intervention)
      db.prepare("UPDATE interventions SET date_intervention = ? WHERE id = ?").run(d.date_intervention, req.params.id);
    if (d.heures_moteur !== undefined)
      db.prepare("UPDATE interventions SET heures_moteur = ? WHERE id = ?").run(d.heures_moteur, req.params.id);
    if (d.description)
      db.prepare("UPDATE interventions SET description = ? WHERE id = ?").run(d.description.trim(), req.params.id);
    if (d.pieces) {
      db.prepare("DELETE FROM intervention_parts WHERE intervention_id = ?").run(req.params.id);
      for (const piece of d.pieces) {
        db.prepare(
          `INSERT INTO intervention_parts (id, intervention_id, nom, reference, quantite, prix_unitaire)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(uuid(), req.params.id, piece.nom.trim(), piece.reference ?? null, piece.quantite, piece.prix_unitaire ?? null);
        upsertCatalogPart(piece.nom, piece.reference, piece.prix_unitaire);
      }
    }
    db.prepare("UPDATE interventions SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  });
  tx();

  res.json(fetchIntervention(req.params.id));
});

interventionsRouter.delete("/:id", (req: AuthedRequest, res) => {
  const existing = db.prepare("SELECT * FROM interventions WHERE id = ?").get(req.params.id) as
    | { technician_id: string; statut: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Intervention introuvable" });
  if (req.user!.role === "technicien") {
    if (existing.technician_id !== req.user!.id || existing.statut !== "en_attente") {
      return res.status(403).json({ error: "Accès refusé" });
    }
  }
  db.prepare("DELETE FROM interventions WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

const validationSchema = z.object({
  valeur: z.number().nonnegative(),
  commentaire_validation: z.string().optional(),
});

interventionsRouter.post("/:id/valider", requireRole("admin"), (req: AuthedRequest, res) => {
  const parsed = validationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = db.prepare("SELECT * FROM interventions WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Intervention introuvable" });

  db.prepare(
    `UPDATE interventions
     SET statut = 'validee', valeur = ?, commentaire_validation = ?, validated_by = ?, validated_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(parsed.data.valeur, parsed.data.commentaire_validation ?? null, req.user!.id, req.params.id);

  res.json(fetchIntervention(req.params.id));
});

const rejectSchema = z.object({
  commentaire_validation: z.string().min(1, "Merci d'indiquer le motif du refus"),
});

interventionsRouter.post("/:id/rejeter", requireRole("admin"), (req: AuthedRequest, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const existing = db.prepare("SELECT * FROM interventions WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Intervention introuvable" });

  db.prepare(
    `UPDATE interventions
     SET statut = 'rejetee', commentaire_validation = ?, validated_by = ?, validated_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(parsed.data.commentaire_validation, req.user!.id, req.params.id);

  res.json(fetchIntervention(req.params.id));
});

// Suggestions pour l'auto-complétion pendant la saisie
interventionsRouter.get("/suggestions/descriptions", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const rows = db
    .prepare(
      `SELECT texte FROM description_catalog
       WHERE texte LIKE ? ESCAPE '\\'
       ORDER BY usage_count DESC, texte ASC
       LIMIT 8`
    )
    .all(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) as { texte: string }[];
  res.json(rows.map((r) => r.texte));
});

interventionsRouter.get("/suggestions/pieces", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const rows = db
    .prepare(
      `SELECT nom, reference, prix_unitaire_defaut FROM parts_catalog
       WHERE nom LIKE ? ESCAPE '\\'
       ORDER BY usage_count DESC, nom ASC
       LIMIT 8`
    )
    .all(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  res.json(rows);
});
