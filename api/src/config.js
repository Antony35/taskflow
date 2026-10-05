// Lecture et validation de la configuration, exclusivement par variables d'environnement.
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';

function readInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`La variable ${name} doit être un entier positif (valeur reçue : "${raw}")`);
  }
  return value;
}

// Le mot de passe peut être fourni directement (DB_PASSWORD) ou par un fichier
// (DB_PASSWORD_FILE), par exemple un secret monté par l'orchestrateur.
// DB_PASSWORD_FILE est prioritaire.
function readDbPassword() {
  const file = process.env.DB_PASSWORD_FILE;
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch (err) {
      throw new Error(`Impossible de lire DB_PASSWORD_FILE (${file}) : ${err.message}`);
    }
  }
  return process.env.DB_PASSWORD ?? '';
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const config = {
  app: {
    name: pkg.name,
    version: pkg.version,
    env: process.env.APP_ENV || 'development',
    hostname: hostname(),
  },
  http: {
    host: process.env.HOST || '0.0.0.0',
    port: readInt('PORT', 3000),
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: readInt('DB_PORT', 5432),
    database: process.env.DB_NAME || 'taskflow',
    user: process.env.DB_USER || 'taskflow',
    password: readDbPassword(),
    connectRetries: readInt('DB_CONNECT_RETRIES', 5),
    connectIntervalMs: readInt('DB_CONNECT_INTERVAL_MS', 2000),
  },
  stress: {
    maxMs: readInt('STRESS_MAX_MS', 5000),
  },
  shutdownTimeoutMs: readInt('SHUTDOWN_TIMEOUT_MS', 8000),
};
