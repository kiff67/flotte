import express from "express";
import cors from "cors";
import { initSchema } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { boatsRouter } from "./routes/boats.js";
import { interventionsRouter } from "./routes/interventions.js";
import { usersRouter } from "./routes/users.js";

async function main() {
  await initSchema();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/boats", boatsRouter);
  app.use("/api/interventions", interventionsRouter);
  app.use("/api/users", usersRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  });

  const PORT = Number(process.env.PORT ?? 4000);
  app.listen(PORT, () => {
    console.log(`API flotte démarrée sur http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Impossible de démarrer le serveur (connexion à SQL Server) :", err);
  process.exit(1);
});
