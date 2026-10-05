// Point d'entrée : initialisation de la base, démarrage du serveur HTTP, arrêt propre.
import http from 'node:http';
import { config } from './config.js';
import { appState, createApp } from './app.js';
import { initDatabase, pool } from './db.js';
import { log } from './logger.js';

let server;

async function start() {
  const { name, version, env } = config.app;
  log('info', `Démarrage de ${name} ${version} (APP_ENV=${env})`);
  if (!config.db.password) {
    log('warn', 'Aucun mot de passe de base de données fourni (DB_PASSWORD ou DB_PASSWORD_FILE)');
  }

  await initDatabase();

  server = http.createServer(createApp());
  server.on('error', (err) => {
    log('error', `Serveur HTTP : ${err.message}`);
    process.exit(1);
  });
  server.listen(config.http.port, config.http.host, () => {
    log('info', `API à l'écoute sur ${config.http.host}:${config.http.port}`);
  });
}

// Arrêt propre sur SIGTERM (docker stop, orchestrateur) ou SIGINT (Ctrl+C) :
// refus des nouvelles connexions, fin des requêtes en cours, fermeture du pool.
// Sans gestionnaire, un processus Node.js lancé en PID 1 ignore SIGTERM.
async function shutdown(signal) {
  if (appState.shuttingDown) return;
  appState.shuttingDown = true;
  log('info', `Signal ${signal} reçu : arrêt en cours`);

  const forceExit = setTimeout(() => {
    log('error', `Arrêt forcé après ${config.shutdownTimeoutMs} ms`);
    process.exit(1);
  }, config.shutdownTimeoutMs);
  forceExit.unref();

  try {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
    log('info', 'Arrêt terminé');
    process.exit(0);
  } catch (err) {
    log('error', `Erreur pendant l'arrêt : ${err.message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  log('error', `Échec du démarrage : ${err.message}`);
  process.exit(1);
});
