// Ressource /api/tasks : CRUD des tâches.
import { Router } from 'express';
import { pool } from '../db.js';

const COLUMNS = 'id, title, done, created_at AS "createdAt", updated_at AS "updatedAt"';
const TITLE_MAX_LENGTH = 200;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function parseId(raw) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0 || String(id) !== raw) {
    throw new ValidationError('Identifiant de tâche invalide');
  }
  return id;
}

function parseTitle(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError('Le champ "title" est obligatoire et doit être une chaîne non vide');
  }
  const title = value.trim();
  if (title.length > TITLE_MAX_LENGTH) {
    throw new ValidationError(`Le champ "title" ne doit pas dépasser ${TITLE_MAX_LENGTH} caractères`);
  }
  return title;
}

function parseDone(value) {
  if (typeof value !== 'boolean') {
    throw new ValidationError('Le champ "done" doit être un booléen');
  }
  return value;
}

export const tasksRouter = Router();

// Liste des tâches, les plus récentes en premier
tasksRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM tasks ORDER BY created_at DESC, id DESC`);
  res.json(rows);
});

// Création d'une tâche : { "title": "..." }
tasksRouter.post('/', async (req, res) => {
  const title = parseTitle(req.body?.title);
  const { rows } = await pool.query(
    `INSERT INTO tasks (title) VALUES ($1) RETURNING ${COLUMNS}`,
    [title],
  );
  res.status(201).location(`/api/tasks/${rows[0].id}`).json(rows[0]);
});

// Lecture d'une tâche
tasksRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(rows[0]);
});

// Modification partielle : { "title"?: "...", "done"?: true|false }
tasksRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body ?? {};
  const sets = [];
  const values = [];

  if (body.title !== undefined) {
    values.push(parseTitle(body.title));
    sets.push(`title = $${values.length}`);
  }
  if (body.done !== undefined) {
    values.push(parseDone(body.done));
    sets.push(`done = $${values.length}`);
  }
  if (sets.length === 0) {
    throw new ValidationError('Aucun champ à modifier : "title" et/ou "done" attendus');
  }

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING ${COLUMNS}`,
    values,
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(rows[0]);
});

// Suppression d'une tâche
tasksRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Tâche introuvable' });
  res.status(204).end();
});
