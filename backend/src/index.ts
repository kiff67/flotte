import "./env.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initSchema } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { boatsRouter } from "./routes/boats.js";
import { interventionsRouter } from "./routes/interventions.js";
import { usersRouter } from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/index.ts (dev, via tsx) ou backend/dist/index.js (prod, compilé) sont tous les
// deux à un niveau sous backend/ : dans les deux cas ../../frontend/dist pointe vers le build du
// frontend à la racine du dépôt.
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

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

  if (existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    // Toute route qui n'est pas /api/... sert l'app React (routage géré côté client).
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    });
    console.log(`[frontend] Fichiers statiques servis depuis ${FRONTEND_DIST}`);
  } else {
    console.log(
      `[frontend] Aucun build trouvé dans ${FRONTEND_DIST} — seule l'API est servie ` +
        `(lancez "npm run build" dans frontend/ pour que ce serveur serve aussi l'app).`
    );
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  });

  // Sous iisnode (Plesk/IIS), process.env.PORT n'est PAS un numéro de port TCP mais le chemin
  // d'un named pipe Windows (ex. \\.\pipe\...) par lequel IIS communique avec ce process Node :
  // il ne faut surtout pas le convertir en Number (ça donnerait NaN et app.listen() plante).
  // On ne retombe sur le port numérique par défaut que si la variable n'est pas définie du tout.
  const PORT: string | number = process.env.PORT ?? 4000;
  const isNumericPort = /^\d+$/.test(String(PORT));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- named pipe (string) ou port TCP (number)
  app.listen(PORT as any, () => {
    console.log(`API flotte démarrée sur ${isNumericPort ? `http://localhost:${PORT}` : PORT}`);
  });
}

main().catch((err) => {
  console.error("Impossible de démarrer le serveur (connexion à SQL Server) :", err);
  process.exit(1);
});
