// Charge backend/.env s'il existe (variables DB_*, JWT_SECRET, PORT...).
// Doit être importé en tout premier, avant tout module qui lit process.env au chargement (ex. db.ts).
try {
  process.loadEnvFile();
} catch {
  // Pas de fichier .env : on utilise les variables d'environnement déjà définies par le système.
}
