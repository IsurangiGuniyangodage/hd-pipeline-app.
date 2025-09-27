const express = require('express');
const app = express();

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/sum', (req, res) => {
  const a = Number(req.query.a || 0);
  const b = Number(req.query.b || 0);
  res.json({ sum: a + b });
});

module.exports = app;
