import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { signToken } from "../auth.js";
import { asyncHandler } from "../utils.js";
import { z } from "zod";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "technicien" | "admin";
}

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Email ou mot de passe manquant" });
    }
    const { email, password } = parsed.data;
    const rows = await query<UserRow>("SELECT * FROM dbo.users WHERE email = @email", {
      email: email.toLowerCase(),
    });
    const user = rows[0];

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const token = signToken({ id: user.id, name: user.name, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
  })
);
