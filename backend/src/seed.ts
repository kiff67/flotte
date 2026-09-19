import "./env.js";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { closePool, initSchema, query } from "./db.js";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "cklein@navigfrance.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
const TECH_EMAIL = "technicien@navigfrance.com";
const TECH_PASSWORD = "technicien1234";

async function main() {
  await initSchema();

  const existingAdmin = await query("SELECT id FROM dbo.users WHERE email = @email", { email: ADMIN_EMAIL });
  if (!existingAdmin[0]) {
    await query(
      "INSERT INTO dbo.users (id, name, email, password_hash, role) VALUES (@id, @name, @email, @password_hash, 'admin')",
      { id: uuid(), name: "Gérant", email: ADMIN_EMAIL, password_hash: bcrypt.hashSync(ADMIN_PASSWORD, 10) }
    );
    console.log(`Compte admin créé : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log("Compte admin déjà existant, non recréé.");
  }

  const existingTech = await query("SELECT id FROM dbo.users WHERE email = @email", { email: TECH_EMAIL });
  if (!existingTech[0]) {
    await query(
      "INSERT INTO dbo.users (id, name, email, password_hash, role) VALUES (@id, @name, @email, @password_hash, 'technicien')",
      { id: uuid(), name: "Technicien Démo", email: TECH_EMAIL, password_hash: bcrypt.hashSync(TECH_PASSWORD, 10) }
    );
    console.log(`Compte technicien de démo créé : ${TECH_EMAIL} / ${TECH_PASSWORD}`);
  }

  const boatCountRows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM dbo.boats");
  const boatCount = boatCountRows[0]?.n ?? 0;
  if (boatCount === 0) {
    for (let i = 1; i <= 31; i++) {
      const label = `Bateau ${String(i).padStart(2, "0")}`;
      await query(
        "INSERT INTO dbo.boats (id, name, model, heures_moteur_actuelles) VALUES (@id, @name, @model, 0)",
        { id: uuid(), name: label, model: "À renseigner" }
      );
    }
    console.log("31 bateaux créés (à renommer depuis l'espace admin).");
  } else {
    console.log(`${boatCount} bateaux déjà présents, seed des bateaux ignoré.`);
  }

  console.log("Seed terminé.");
}

main()
  .catch((err) => {
    console.error("Erreur lors du seed :", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
