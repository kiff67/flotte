import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../utils.js";

export const boatsRouter = Router();
boatsRouter.use(requireAuth);

interface BoatRow {
  id: string;
  name: string;
  model: string | null;
  immatriculation: string | null;
  port_attache: string | null;
  heures_moteur_actuelles: number;
  actif: boolean | number;
}

boatsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const boats = await query(
      `SELECT b.*,
        (SELECT COUNT(*) FROM dbo.interventions i WHERE i.boat_id = b.id AND i.statut = 'en_attente') AS interventions_en_attente
       FROM dbo.boats b
       ORDER BY b.actif DESC, b.name ASC`
    );
    res.json(boats);
  })
);

boatsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const rows = await query<BoatRow>("SELECT * FROM dbo.boats WHERE id = @id", { id: req.params.id });
    if (!rows[0]) return res.status(404).json({ error: "Bateau introuvable" });
    res.json(rows[0]);
  })
);

const boatSchema = z.object({
  name: z.string().min(1),
  model: z.string().optional(),
  immatriculation: z.string().optional(),
  port_attache: z.string().optional(),
  heures_moteur_actuelles: z.number().optional(),
  actif: z.boolean().optional(),
});

boatsRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = boatSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const id = uuid();
    const d = parsed.data;
    await query(
      `INSERT INTO dbo.boats (id, name, model, immatriculation, port_attache, heures_moteur_actuelles)
       VALUES (@id, @name, @model, @immatriculation, @port_attache, @heures_moteur_actuelles)`,
      {
        id,
        name: d.name,
        model: d.model ?? null,
        immatriculation: d.immatriculation ?? null,
        port_attache: d.port_attache ?? null,
        heures_moteur_actuelles: d.heures_moteur_actuelles ?? 0,
      }
    );
    const rows = await query<BoatRow>("SELECT * FROM dbo.boats WHERE id = @id", { id });
    res.status(201).json(rows[0]);
  })
);

boatsRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = boatSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

    const rows = await query<BoatRow>("SELECT * FROM dbo.boats WHERE id = @id", { id: req.params.id });
    const boat = rows[0];
    if (!boat) return res.status(404).json({ error: "Bateau introuvable" });

    const d = parsed.data;
    const merged = {
      name: d.name ?? boat.name,
      model: d.model ?? boat.model,
      immatriculation: d.immatriculation ?? boat.immatriculation,
      port_attache: d.port_attache ?? boat.port_attache,
      heures_moteur_actuelles: d.heures_moteur_actuelles ?? boat.heures_moteur_actuelles,
      actif: d.actif !== undefined ? d.actif : Boolean(boat.actif),
    };

    await query(
      `UPDATE dbo.boats
       SET name = @name, model = @model, immatriculation = @immatriculation, port_attache = @port_attache,
           heures_moteur_actuelles = @heures_moteur_actuelles, actif = @actif
       WHERE id = @id`,
      { ...merged, id: req.params.id }
    );

    const updated = await query<BoatRow>("SELECT * FROM dbo.boats WHERE id = @id", { id: req.params.id });
    res.json(updated[0]);
  })
);
