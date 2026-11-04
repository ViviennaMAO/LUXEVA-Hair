// Key-value store for orders and sandbox payments.
//   - Upstash Redis (REST) when KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set — use this on Vercel
//   - JSON file (data/orders.json) when running locally
//   - in-memory fallback on serverless without Redis (data is lost when the instance recycles)
const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL_SECONDS = 60 * 60 * 24 * 90;

function redisBackend() {
  const cmd = async (...args) => {
    const res = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(args) });
    const data = await res.json();
    if (data.error) throw new Error('Redis: ' + data.error);
    return data.result;
  };
  return {
    name: 'redis',
    async get(key) { const v = await cmd('GET', key); return v ? JSON.parse(v) : null; },
    async set(key, value) { await cmd('SET', key, JSON.stringify(value), 'EX', TTL_SECONDS); },
  };
}

function fileBackend() {
  const FILE = process.env.PWV_LOCAL_STORE_FILE || path.join(__dirname, '..', 'data', 'orders.json');
  let data = {};
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }
  return {
    name: 'file',
    async get(key) { return data[key] || null; },
    async set(key, value) { data[key] = value; fs.writeFileSync(FILE, JSON.stringify(data, null, 1)); },
  };
}

function memoryBackend() {
  const data = new Map();
  return {
    name: 'memory',
    async get(key) { return data.get(key) || null; },
    async set(key, value) { data.set(key, value); },
  };
}

const backend = REDIS_URL && REDIS_TOKEN ? redisBackend() : process.env.VERCEL ? memoryBackend() : fileBackend();

module.exports = {
  backend: backend.name,
  get: (key) => backend.get(key),
  set: (key, value) => backend.set(key, value),
  async update(key, patch) {
    const cur = await backend.get(key);
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    await backend.set(key, next);
    return next;
  },
};
