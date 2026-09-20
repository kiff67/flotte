import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER ?? "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  database: process.env.DB_NAME ?? "FlotteMaintenance",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT !== "false",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false",
    // Certains serveurs SQL Server anciens (souvent ceux fournis avec des logiciels tiers type
    // EBP) ne savent négocier que du TLS 1.0/1.1, que Node.js/OpenSSL 3 refuse par défaut.
    // DB_MIN_TLS_VERSION permet d'abaisser la version minimale acceptée si le chiffrement est
    // imposé côté serveur (sinon, DB_ENCRYPT=false évite entièrement la négociation TLS).
    ...(process.env.DB_MIN_TLS_VERSION
      ? { cryptoCredentialsDetails: { minVersion: process.env.DB_MIN_TLS_VERSION as import("tls").SecureVersion } }
      : {}),
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

console.log(
  `[db] Connexion configurée : server=${config.server} port=${config.port} database=${config.database} ` +
    `user=${config.user ?? "(non défini)"} encrypt=${config.options?.encrypt} ` +
    `trustServerCertificate=${config.options?.trustServerCertificate}`
);

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

export async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const pool = await getPool();
  const request = pool.request();
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value ?? null);
  }
  const result = await request.query<T>(text);
  return result.recordset;
}

export function txRequest(transaction: sql.Transaction): sql.Request {
  return new sql.Request(transaction);
}

export async function txQuery<T = Record<string, unknown>>(
  transaction: sql.Transaction,
  text: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const request = txRequest(transaction);
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value ?? null);
  }
  const result = await request.query<T>(text);
  return result.recordset;
}

export async function withTransaction<T>(fn: (tx: sql.Transaction) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const result = await fn(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

const SCHEMA = `
IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    email NVARCHAR(320) NOT NULL,
    password_hash NVARCHAR(200) NOT NULL,
    role NVARCHAR(20) NOT NULL CHECK (role IN ('technicien', 'admin')),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_users_email UNIQUE (email)
  );
END

IF OBJECT_ID('dbo.boats', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.boats (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    model NVARCHAR(200) NULL,
    immatriculation NVARCHAR(100) NULL,
    port_attache NVARCHAR(200) NULL,
    heures_moteur_actuelles FLOAT NOT NULL DEFAULT 0,
    actif BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.parts_catalog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.parts_catalog (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    nom NVARCHAR(300) NOT NULL,
    reference NVARCHAR(200) NULL,
    prix_unitaire_defaut FLOAT NULL,
    usage_count INT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_parts_catalog_nom UNIQUE (nom)
  );
END

-- NVARCHAR(MAX) ne peut pas porter de contrainte UNIQUE (limite d'index à 900 octets) :
-- l'unicité des descriptions est garantie par l'application (lecture puis écriture).
IF OBJECT_ID('dbo.description_catalog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.description_catalog (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    texte NVARCHAR(MAX) NOT NULL,
    usage_count INT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.interventions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.interventions (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    boat_id NVARCHAR(36) NOT NULL REFERENCES dbo.boats(id),
    technician_id NVARCHAR(36) NOT NULL REFERENCES dbo.users(id),
    date_intervention DATE NOT NULL,
    heures_moteur FLOAT NOT NULL,
    duree_heures FLOAT NULL,
    description NVARCHAR(MAX) NOT NULL,
    statut NVARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
    valeur FLOAT NULL,
    commentaire_validation NVARCHAR(MAX) NULL,
    validated_by NVARCHAR(36) NULL REFERENCES dbo.users(id),
    validated_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END

IF OBJECT_ID('dbo.intervention_parts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.intervention_parts (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    intervention_id NVARCHAR(36) NOT NULL REFERENCES dbo.interventions(id) ON DELETE CASCADE,
    nom NVARCHAR(300) NOT NULL,
    reference NVARCHAR(200) NULL,
    quantite FLOAT NOT NULL DEFAULT 1,
    prix_unitaire FLOAT NULL
  );
END

-- Migration : ajoute la colonne durée si la table existait déjà avant son introduction.
IF COL_LENGTH('dbo.interventions', 'duree_heures') IS NULL
  ALTER TABLE dbo.interventions ADD duree_heures FLOAT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_interventions_boat')
  CREATE INDEX idx_interventions_boat ON dbo.interventions(boat_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_interventions_statut')
  CREATE INDEX idx_interventions_statut ON dbo.interventions(statut);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_interventions_technician')
  CREATE INDEX idx_interventions_technician ON dbo.interventions(technician_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_intervention_parts_intervention')
  CREATE INDEX idx_intervention_parts_intervention ON dbo.intervention_parts(intervention_id);
`;

export async function initSchema() {
  const pool = await getPool();
  await pool.request().batch(SCHEMA);
}

export { sql };
