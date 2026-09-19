import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "..", "data", "flotte.db");

import fs from "node:fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('technicien', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  immatriculation TEXT,
  port_attache TEXT,
  heures_moteur_actuelles REAL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parts_catalog (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  reference TEXT,
  prix_unitaire_defaut REAL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS description_catalog (
  id TEXT PRIMARY KEY,
  texte TEXT NOT NULL UNIQUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interventions (
  id TEXT PRIMARY KEY,
  boat_id TEXT NOT NULL REFERENCES boats(id),
  technician_id TEXT NOT NULL REFERENCES users(id),
  date_intervention TEXT NOT NULL,
  heures_moteur REAL NOT NULL,
  description TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
  valeur REAL,
  commentaire_validation TEXT,
  validated_by TEXT REFERENCES users(id),
  validated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS intervention_parts (
  id TEXT PRIMARY KEY,
  intervention_id TEXT NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  reference TEXT,
  quantite REAL NOT NULL DEFAULT 1,
  prix_unitaire REAL
);

CREATE INDEX IF NOT EXISTS idx_interventions_boat ON interventions(boat_id);
CREATE INDEX IF NOT EXISTS idx_interventions_statut ON interventions(statut);
CREATE INDEX IF NOT EXISTS idx_interventions_technician ON interventions(technician_id);
CREATE INDEX IF NOT EXISTS idx_intervention_parts_intervention ON intervention_parts(intervention_id);
`);
