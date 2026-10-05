// Application Express : middlewares, routes techniques et routes métier.
import express from 'express';
import { config } from './config.js';
import { isDatabaseReady } from './db.js';
import { log } from './logger.js';
import { tasksRouter } from './routes/tasks.js';

// État partagé avec server.js : passe à true dès la réception d'un signal d'arrêt.
export const appState = { shuttingDown: false };

// Routes techniques exclues du journal des requêtes (appelées très fréquemment par les sondes).
const UNLOGGED_PATHS = new Set(['/healthz', '/readyz']);

// Consomme du CPU pendant `ms` millisecondes, par tranches de 10 ms,
// en rendant la main à la boucle d'événements entre deux tranches
// pour que l'instance continue de répondre aux autres requêtes.
async function burnCpu(ms) {
  const end = Date.now() + ms;
  let x = 0;
  while (Date.now() < end) {
    const sliceEnd = Math.min(end, Date.now() + 10);
    while (Date.now() < sliceEnd) {
      x += Math.sqrt(Math.random());
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  return x;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  // Identifie l'instance qui a traité la requête et journalise la requête.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.setHeader('X-Served-By', config.app.hostname);
    res.on('finish', () => {
      if (UNLOGGED_PATHS.has(req.path)) return;
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      log('info', `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
    });
    next();
  });

  // Vivacité : le processus répond. Ne dépend pas de la base de données.
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', version: config.app.version, hostname: config.app.hostname });
  });

  // Disponibilité : l'instance peut traiter des requêtes (base joignable, pas d'arrêt en cours).
  app.get('/readyz', async (req, res) => {
    if (appState.shuttingDown) {
      return res.status(503).json({ status: 'shutting-down', hostname: config.app.hostname });
    }
    const dbReady = await isDatabaseReady();
    res.status(dbReady ? 200 : 503).json({
      status: dbReady ? 'ready' : 'database-unavailable',
      hostname: config.app.hostname,
    });
  });

  // Informations sur l'instance
  app.get('/api/info', (req, res) => {
    res.json({
      name: config.app.name,
      version: config.app.version,
      env: config.app.env,
      hostname: config.app.hostname,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Génération de charge CPU : /api/stress?ms=500
  app.get('/api/stress', async (req, res) => {
    const raw = req.query.ms ?? '500';
    const ms = Number.parseInt(raw, 10);
    if (Number.isNaN(ms) || ms <= 0) {
      return res.status(400).json({ error: 'Le paramètre "ms" doit être un entier strictement positif' });
    }
    const effectiveMs = Math.min(ms, config.stress.maxMs);
    await burnCpu(effectiveMs);
    res.json({ hostname: config.app.hostname, requestedMs: ms, burnedMs: effectiveMs });
  });

  app.use('/api/tasks', tasksRouter);

  // Route inconnue
  app.use((req, res) => {
    res.status(404).json({ error: `Route introuvable : ${req.method} ${req.path}` });
  });

  // Gestion centralisée des erreurs (Express 5 transmet aussi les erreurs des fonctions async)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Corps de requête JSON invalide' });
    }
    const status = err.status ?? 500;
    if (status >= 500) {
      log('error', `${req.method} ${req.originalUrl} : ${err.stack ?? err.message}`);
      return res.status(status).json({ error: 'Erreur interne' });
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}
