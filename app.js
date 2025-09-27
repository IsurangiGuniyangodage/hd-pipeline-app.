// app.js
const express = require('express');
const morgan = require('morgan');
const Items = require('./items'); // simple in-memory service

const app = express();

// --- config ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'dev-key'; // for demo; set in Jenkins/Compose

// --- middleware ---
app.use(express.json());
app.use(morgan('dev'));

// auth middleware for mutating routes
function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!key || key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// --- endpoints ---

// health (for Monitoring stage)
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// tiny sample logic you had
app.get('/sum', (req, res) => {
  const a = Number(req.query.a);
  const b = Number(req.query.b);
  if (Number.isNaN(a) || Number.isNaN(b)) return res.status(400).json({ error: 'a and b must be numbers' });
  return res.json({ result: a + b });
});

// CRUD: items
app.get('/items', (req, res) => {
  res.json(Items.list());
});

app.post('/items', requireApiKey, (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  const created = Items.create({ name });
  res.status(201).json(created);
});

app.get('/items/:id', (req, res) => {
  const item = Items.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

app.put('/items/:id', requireApiKey, (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  const updated = Items.update(req.params.id, { name });
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

app.delete('/items/:id', requireApiKey, (req, res) => {
  const ok = Items.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.status(204).send();
});

// global error handler (belt & suspenders)
app.use((err, req, res, next) => {
  /* eslint-disable no-console */
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal error' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`App listening on :${PORT}`));
}

module.exports = app;
