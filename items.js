// items.js - trivial in-memory store to show a separate "service" component
const crypto = require('crypto');

const db = new Map();

function list() {
  return Array.from(db.values());
}

function create({ name }) {
  const id = crypto.randomUUID();
  const item = { id, name, createdAt: new Date().toISOString() };
  db.set(id, item);
  return item;
}

function get(id) {
  return db.get(id) || null;
}

function update(id, { name }) {
  const existing = db.get(id);
  if (!existing) return null;
  const updated = { ...existing, name, updatedAt: new Date().toISOString() };
  db.set(id, updated);
  return updated;
}

function remove(id) {
  return db.delete(id);
}

module.exports = { list, create, get, update, remove };
