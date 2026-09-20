// Charge backend/.env s'il existe (variables DB_*, JWT_SECRET, PORT...).
// Doit être importé en tout premier, avant tout module qui lit process.env au chargement (ex. db.ts).
import { existsSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
  console.log(`[env] Fichier .env chargé : ${envPath}`);
} else {
  console.log(
    `[env] Aucun fichier .env trouvé à l'emplacement attendu (${envPath}) — utilisation des ` +
      `seules variables d'environnement système. Sous Windows, vérifiez que le fichier n'a pas ` +
      `été enregistré en ".env.txt" (Explorateur Windows masque les extensions connues par défaut).`
  );
}
