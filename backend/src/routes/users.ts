import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get("/", requireRole("admin"), (_req, res) => {
  const users = db.prepare("SELECT id, name, email, role, created_at FROM users ORDER BY role, name").all();
  res.json(users);
});

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  role: z.enum(["technicien", "admin"]),
});

usersRouter.post("/", requireRole("admin"), (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const email = d.email.toLowerCase();

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Un compte existe déjà avec cet email" });

  const id = uuid();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
    id,
    d.name,
    email,
    bcrypt.hashSync(d.password, 10),
    d.role
  );
  res.status(201).json({ id, name: d.name, email, role: d.role });
});
