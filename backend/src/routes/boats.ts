import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../auth.js";

export const boatsRouter = Router();
boatsRouter.use(requireAuth);

boatsRouter.get("/", (_req, res) => {
  const boats = db
    .prepare(
      `SELECT b.*,
        (SELECT COUNT(*) FROM interventions i WHERE i.boat_id = b.id AND i.statut = 'en_attente') AS interventions_en_attente
       FROM boats b
       ORDER BY b.actif DESC, b.name ASC`
    )
    .all();
  res.json(boats);
});

boatsRouter.get("/:id", (req, res) => {
  const boat = db.prepare("SELECT * FROM boats WHERE id = ?").get(req.params.id);
  if (!boat) return res.status(404).json({ error: "Bateau introuvable" });
  res.json(boat);
});

const boatSchema = z.object({
  name: z.string().min(1),
  model: z.string().optional(),
  immatriculation: z.string().optional(),
  port_attache: z.string().optional(),
  heures_moteur_actuelles: z.number().optional(),
  actif: z.boolean().optional(),
});

interface BoatRow {
  id: string;
  name: string;
  model: string | null;
  immatriculation: string | null;
  port_attache: string | null;
  heures_moteur_actuelles: number;
  actif: number;
}

boatsRouter.post("/", requireRole("admin"), (req: AuthedRequest, res) => {
  const parsed = boatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const id = uuid();
  const d = parsed.data;
  db.prepare(
    `INSERT INTO boats (id, name, model, immatriculation, port_attache, heures_moteur_actuelles)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, d.name, d.model ?? null, d.immatriculation ?? null, d.port_attache ?? null, d.heures_moteur_actuelles ?? 0);
  res.status(201).json(db.prepare("SELECT * FROM boats WHERE id = ?").get(id));
});

boatsRouter.patch("/:id", requireRole("admin"), (req, res) => {
  const parsed = boatSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const boat = db.prepare("SELECT * FROM boats WHERE id = ?").get(req.params.id) as BoatRow | undefined;
  if (!boat) return res.status(404).json({ error: "Bateau introuvable" });
  const d = parsed.data;
  const merged = {
    name: d.name ?? boat.name,
    model: d.model ?? boat.model,
    immatriculation: d.immatriculation ?? boat.immatriculation,
    port_attache: d.port_attache ?? boat.port_attache,
    heures_moteur_actuelles: d.heures_moteur_actuelles ?? boat.heures_moteur_actuelles,
    actif: d.actif !== undefined ? (d.actif ? 1 : 0) : boat.actif,
  };
  db.prepare(
    `UPDATE boats SET name = ?, model = ?, immatriculation = ?, port_attache = ?, heures_moteur_actuelles = ?, actif = ? WHERE id = ?`
  ).run(
    merged.name,
    merged.model,
    merged.immatriculation,
    merged.port_attache,
    merged.heures_moteur_actuelles,
    merged.actif,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM boats WHERE id = ?").get(req.params.id));
});
