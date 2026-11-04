// API request handler, shared by the local server (server.js) and the Vercel function (api/index.js).
const crypto = require('crypto');
const Pricing = require('../public/js/pricing.js');
const catalog = require('../data/catalog.json');
const pwv = require('./pwv');
const store = require('./store');

const productsById = Object.fromEntries(catalog.products.map((p) => [p.id, p]));

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  try { return JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

function publicUrl(req) {
  return process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
}

// Turn client cart lines into priced lines; never trust client prices.
function buildLines(items) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Cart is empty');
  return items.map((i) => {
    const product = productsById[i.id];
    if (!product) throw new HttpError(400, `Unknown product ${i.id}`);
    if (!product.capSizes.includes(i.capSize)) throw new HttpError(400, `Invalid cap size for ${i.id}`);
    return { product, length: Number(i.length), density: i.density || null, capSize: i.capSize, qty: i.qty };
  });
}

function priceOrThrow(lines, opts) {
  try { return Pricing.quote(lines, opts); } catch (e) { throw new HttpError(400, e.message); }
}

function validateShipping(s = {}) {
  const required = ['firstName', 'lastName', 'address1', 'city', 'postalCode', 'country', 'phone'];
  const missing = required.filter((k) => !String(s[k] || '').trim());
  if (missing.length) throw new HttpError(400, `Missing shipping fields: ${missing.join(', ')}`);
  if (!Pricing.COUNTRIES.some(([code]) => code === s.country)) throw new HttpError(400, 'We do not ship to this country yet');
  const clean = {};
  for (const k of [...required, 'address2', 'state']) clean[k] = String(s[k] || '').trim().slice(0, 120);
  return clean;
}

function orderView(o) {
  const { token, ...rest } = o;
  return rest;
}

async function authOrder(id, token) {
  const order = await store.get('order:' + id);
  if (!order || !token || order.token !== token) throw new HttpError(404, 'Order not found');
  return order;
}

async function startPayment(req, order) {
  const attempts = (order.attempts || 0) + 1;
  const base = publicUrl(req);
  const { paymentId, checkoutUrl } = await pwv.createPayment({ ...order, attempts }, {
    returnUrl: `${base}/#/order/${order.id}?token=${order.token}`,
    notifyUrl: `${base}/api/pwv/webhook`,
  });
  await store.update('order:' + order.id, { attempts, status: 'awaiting_payment', paymentId });
  return { orderId: order.id, token: order.token, checkoutUrl };
}

// Async notification from PWV — the single source of truth for payment status.
async function handleNotification(raw, signature) {
  if (!pwv.verifySignature(raw, signature)) throw new HttpError(401, 'Bad signature');
  const evt = JSON.parse(raw);
  const d = evt.data || {};
  const order = await store.get('order:' + d.merchant_order_no);
  if (!order) throw new HttpError(404, 'Unknown order');
  if (order.paymentEvents.some((e) => e.id === evt.id)) return { received: true, duplicate: true };
  if (d.payment_id !== order.paymentId) throw new HttpError(400, 'Payment mismatch');
  if (d.amount !== order.total || d.currency !== order.currency) throw new HttpError(400, 'Amount mismatch');

  const events = [...order.paymentEvents, { id: evt.id, type: evt.type, paymentId: d.payment_id, method: d.method, last4: d.card_last4, reason: d.failure_reason, at: new Date().toISOString() }];
  const patch = { paymentEvents: events };
  if (order.status !== 'paid') {
    if (evt.type === 'payment.succeeded') Object.assign(patch, { status: 'paid', paidAt: new Date().toISOString(), paymentId: d.payment_id });
    else if (evt.type === 'payment.failed') Object.assign(patch, { status: 'payment_failed', failureReason: d.failure_reason });
  }
  await store.update('order:' + order.id, patch);
  console.log(`[webhook] ${evt.type} ${order.id} ${Pricing.format(d.amount, d.currency)}`);
  return { received: true };
}

const routes = [
  ['GET', /^\/api\/catalog$/, async () => catalog],

  ['GET', /^\/api\/config$/, async () => ({
    currencies: Pricing.CURRENCIES, shipping: Pricing.SHIPPING, countries: Pricing.COUNTRIES,
    pwv: { mode: pwv.config.mode, merchantId: pwv.config.merchantId }, storage: store.backend,
  })],

  ['POST', /^\/api\/quote$/, async (req) => {
    const b = await readJson(req);
    return priceOrThrow(buildLines(b.items), b);
  }],

  ['POST', /^\/api\/orders$/, async (req) => {
    const b = await readJson(req);
    const email = String(b.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email');
    const shipping = validateShipping(b.shipping);
    const { shipping: shippingFee, ...q } = priceOrThrow(buildLines(b.items), b);
    const now = new Date();
    const order = {
      id: 'LX' + now.toISOString().slice(2, 10).replace(/-/g, '') + crypto.randomBytes(3).toString('hex').toUpperCase(),
      token: crypto.randomBytes(16).toString('hex'),
      status: 'created', email, shipping, shippingFee, ...q, paymentEvents: [], attempts: 0,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    await store.set('order:' + order.id, order);
    return startPayment(req, order);
  }],

  ['GET', /^\/api\/orders\/([\w-]+)$/, async (req, [id], query) => {
    let order = await authOrder(id, query.get('token'));
    if (pwv.config.mode === 'local-platform' && order.status !== 'paid') {
      try {
        const receipt = await require('./local-platform').receipt(order);
        if (receipt?.state === 'PAID') order = await store.update('order:' + id, { status: 'paid', paidAt: new Date().toISOString(), paymentId: receipt.payment_id });
      } catch { /* Keep pending if the platform cannot be verified. */ }
    }
    return orderView(order);
  }],

  ['POST', /^\/api\/orders\/([\w-]+)\/pay$/, async (req, [id], query) => {
    const order = await authOrder(id, query.get('token'));
    if (order.status === 'paid') throw new HttpError(409, 'Order is already paid');
    return startPayment(req, order);
  }],

  ['POST', /^\/api\/pwv\/webhook$/, async (req) => handleNotification(await readBody(req), req.headers['x-pwv-signature'])],

  // --- PWV sandbox cashier (only available in sandbox mode) ---
  ['GET', /^\/api\/pwv-sandbox\/payments\/(pwv_\w+)$/, async (req, [pid]) => {
    if (pwv.config.mode !== 'sandbox') throw new HttpError(404, 'Not found');
    const p = await pwv.sandbox.publicView(pid);
    if (!p) throw new HttpError(404, 'Payment not found');
    return p;
  }],

  ['POST', /^\/api\/pwv-sandbox\/payments\/(pwv_\w+)\/confirm$/, async (req, [pid]) => {
    if (pwv.config.mode !== 'sandbox') throw new HttpError(404, 'Not found');
    return pwv.sandbox.confirm(pid, await readJson(req), handleNotification);
  }],
];

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  for (const [method, re, handler] of routes) {
    const m = url.pathname.match(re);
    if (!m || req.method !== method) continue;
    try {
      return send(res, 200, await handler(req, m.slice(1), url.searchParams));
    } catch (e) {
      if (!e.status) console.error(e);
      return send(res, e.status || 500, { error: e.status ? e.message : 'Internal error' });
    }
  }
  send(res, 404, { error: 'Not found' });
}

module.exports = { handleApi, send };
