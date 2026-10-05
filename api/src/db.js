// Accès à PostgreSQL : pool de connexions, attente de disponibilité et création du schéma.
import pg from 'pg';
import { config } from './config.js';
import { log } from './logger.js';

export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 10,
  connectionTimeoutMillis: 5000,
});

// Une erreur sur une connexion inactive ne doit pas arrêter le processus.
pool.on('error', (err) => log('error', `Erreur sur une connexion inactive : ${err.message}`));

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    done        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`;

// Identifiant arbitraire du verrou consultatif qui sérialise la création du schéma :
// plusieurs réplicas qui démarrent en même temps ne doivent pas exécuter
// CREATE TABLE simultanément (conflit possible dans le catalogue PostgreSQL).
const SCHEMA_LOCK_ID = 727274;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function applySchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_ID]);
    await client.query(SCHEMA);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Tente de joindre la base plusieurs fois, puis crée le schéma s'il n'existe pas.
// Échoue (exception) si la base reste injoignable après toutes les tentatives.
export async function initDatabase() {
  const { host, port, database, connectRetries, connectIntervalMs } = config.db;
  const attempts = connectRetries + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await applySchema();
      log('info', `Base de données ${database} joignable sur ${host}:${port}, schéma vérifié`);
      return;
    } catch (err) {
      const reason = err.code ? `${err.code} ${err.message}` : err.message;
      log('warn', `Connexion à ${host}:${port} impossible (tentative ${attempt}/${attempts}) : ${reason}`);
      if (attempt === attempts) {
        throw new Error(`Base de données injoignable sur ${host}:${port} après ${attempts} tentatives`);
      }
      await sleep(connectIntervalMs);
    }
  }
}

export async function isDatabaseReady() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
