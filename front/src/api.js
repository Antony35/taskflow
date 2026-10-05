// Client de l'API. Tous les appels utilisent des chemins relatifs (/api/...) :
// ils sont envoyés au serveur qui a servi la page, quelle que soit son adresse.
import { ref } from 'vue';

// Nom de l'instance d'API qui a traité la dernière requête (en-tête X-Served-By).
export const lastServedBy = ref(null);

async function request(method, path, body) {
  const options = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('API injoignable');
  }

  lastServedBy.value = response.headers.get('X-Served-By');

  if (response.status === 204) return null;

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Erreur HTTP ${response.status}`);
  }
  if (!isJson) {
    throw new Error('Réponse inattendue : l\'API n\'a pas renvoyé de JSON');
  }
  return payload;
}

export const api = {
  listTasks: () => request('GET', '/api/tasks'),
  createTask: (title) => request('POST', '/api/tasks', { title }),
  updateTask: (id, changes) => request('PATCH', `/api/tasks/${id}`, changes),
  deleteTask: (id) => request('DELETE', `/api/tasks/${id}`),
  info: () => request('GET', '/api/info'),
};
