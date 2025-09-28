// items.js
const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * Mongoose model (used when DB is connected)
 */
const itemSchema = new mongoose.Schema(
  { name: { type: String, required: true } },
  { timestamps: true }
);

// Avoid model recompile in watch/test
const Item =
  (mongoose.models && mongoose.models.Item) ||
  mongoose.model('Item', itemSchema);

/**
 * In-memory fallback (used when no DB connection, e.g. during Jest)
 */
const mem = new Map();

const isMongoReady = () =>
  mongoose.connection && mongoose.connection.readyState === 1;

const normalize = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  const id = (obj._id || obj.id)?.toString();
  delete obj._id;
  return { ...obj, id };
};

async function list() {
  if (isMongoReady()) {
    const docs = await Item.find().lean();
    return docs.map((d) => normalize(d));
  }
  return Array.from(mem.values());
}

async function create({ name }) {
  if (!name || typeof name !== 'string') {
    throw new Error('name is required');
  }

  if (isMongoReady()) {
    const doc = await Item.create({ name });
    return normalize(doc);
  }

  const id = crypto.randomUUID();
  const item = { id, name, createdAt: new Date().toISOString() };
  mem.set(id, item);
  return item;
}

async function get(id) {
  if (isMongoReady()) {
    const doc = await Item.findById(id);
    return normalize(doc);
  }
  return mem.get(id) || null;
}

async function update(id, { name }) {
  if (!name || typeof name !== 'string') {
    throw new Error('name is required');
  }

  if (isMongoReady()) {
    const doc = await Item.findByIdAndUpdate(
      id,
      { name },
      { new: true, runValidators: true }
    );
    return normalize(doc); // null if not found
  }

  const existing = mem.get(id);
  if (!existing) return null;
  const updated = { ...existing, name, updatedAt: new Date().toISOString() };
  mem.set(id, updated);
  return updated;
}

async function remove(id) {
  if (isMongoReady()) {
    const doc = await Item.findByIdAndDelete(id);
    return !!doc;
  }
  return mem.delete(id);
}

module.exports = { list, create, get, update, remove };
