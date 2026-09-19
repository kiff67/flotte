import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { asyncHandler } from "../utils.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const users = await query("SELECT id, name, email, role, created_at FROM dbo.users ORDER BY role, name");
    res.json(users);
  })
);

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  role: z.enum(["technicien", "admin"]),
});

usersRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const d = parsed.data;
    const email = d.email.toLowerCase();

    const existing = await query("SELECT id FROM dbo.users WHERE email = @email", { email });
    if (existing[0]) return res.status(409).json({ error: "Un compte existe déjà avec cet email" });

    const id = uuid();
    await query(
      "INSERT INTO dbo.users (id, name, email, password_hash, role) VALUES (@id, @name, @email, @password_hash, @role)",
      { id, name: d.name, email, password_hash: bcrypt.hashSync(d.password, 10), role: d.role }
    );
    res.status(201).json({ id, name: d.name, email, role: d.role });
  })
);
