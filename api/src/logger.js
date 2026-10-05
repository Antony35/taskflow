// Journalisation sur la sortie standard, une ligne par événement.
// Chaque ligne indique le nom d'hôte pour distinguer les instances.
import { hostname } from 'node:os';

const HOST = hostname();

export function log(level, message) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${HOST}] ${message}`;
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}
