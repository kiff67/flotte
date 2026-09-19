import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { db } from "./db.js";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "cklein@navigfrance.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
const TECH_EMAIL = "technicien@navigfrance.com";
const TECH_PASSWORD = "technicien1234";

const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
if (!existingAdmin) {
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')").run(
    uuid(),
    "Gérant",
    ADMIN_EMAIL,
    bcrypt.hashSync(ADMIN_PASSWORD, 10)
  );
  console.log(`Compte admin créé : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
} else {
  console.log("Compte admin déjà existant, non recréé.");
}

const existingTech = db.prepare("SELECT id FROM users WHERE email = ?").get(TECH_EMAIL);
if (!existingTech) {
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'technicien')").run(
    uuid(),
    "Technicien Démo",
    TECH_EMAIL,
    bcrypt.hashSync(TECH_PASSWORD, 10)
  );
  console.log(`Compte technicien de démo créé : ${TECH_EMAIL} / ${TECH_PASSWORD}`);
}

const boatCount = (db.prepare("SELECT COUNT(*) AS n FROM boats").get() as { n: number }).n;
if (boatCount === 0) {
  const insert = db.prepare(
    "INSERT INTO boats (id, name, model, heures_moteur_actuelles) VALUES (?, ?, ?, 0)"
  );
  const tx = db.transaction(() => {
    for (let i = 1; i <= 31; i++) {
      const label = `Bateau ${String(i).padStart(2, "0")}`;
      insert.run(uuid(), label, "À renseigner");
    }
  });
  tx();
  console.log("31 bateaux créés (à renommer depuis l'espace admin).");
} else {
  console.log(`${boatCount} bateaux déjà présents, seed des bateaux ignoré.`);
}

console.log("Seed terminé.");
