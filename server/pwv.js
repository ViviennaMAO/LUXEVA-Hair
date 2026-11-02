// PWV payment gateway adapter.
//
// Flow (hosted checkout / redirect):
//   1. createPayment()   -> PWV returns payment_id + checkout_url, shopper is redirected there
//   2. shopper pays on the PWV cashier page
//   3. PWV POSTs an async notification (webhook) to notify_url, signed with HMAC-SHA256
//   4. PWV redirects the shopper back to return_url; the shop shows status from its own DB
//
// PWV_MODE=sandbox (default) uses the built-in simulator in this file, so the whole flow can be
// demoed without credentials. PWV_MODE=live calls PWV_API_BASE — map field names in
// toPwvRequest()/fromPwvResponse() to the official PWV API spec once it is available.
const crypto = require('crypto');
const store = require('./store');

const config = {
  mode: process.env.PWV_MODE || 'sandbox',
  merchantId: process.env.PWV_MERCHANT_ID || 'M_SANDBOX_10086',
  apiKey: process.env.PWV_API_KEY || 'pk_sandbox_demo',
  secret: process.env.PWV_SECRET || 'sk_sandbox_demo_secret',
  apiBase: process.env.PWV_API_BASE || 'https://api.pwv.example.com/v1',
};

function sign(rawBody, timestamp) {
  return crypto.createHmac('sha256', config.secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

// Header format: "t=<unix>,v1=<hex>"; rejects stale (>5 min) or forged notifications.
function verifySignature(rawBody, header) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = Buffer.from(sign(rawBody, parts.t), 'hex');
  const got = Buffer.from(parts.v1, 'hex');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

function signatureHeader(rawBody) {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${sign(rawBody, t)}`;
}

function toPwvRequest(order, { returnUrl, notifyUrl }) {
  return {
    merchant_id: config.merchantId,
    merchant_order_no: order.id,
    amount: order.total, // minor units
    currency: order.currency,
    description: `LUXEVA Hair order ${order.id}`,
    customer: { email: order.email, name: `${order.shipping.firstName} ${order.shipping.lastName}`, country: order.shipping.country },
    shipping: order.shipping,
    line_items: order.items.map((i) => ({ sku: i.id, name: i.name, quantity: i.qty, unit_amount: i.unit })),
    discount_amount: order.discount,
    shipping_amount: order.shippingFee,
    return_url: returnUrl,
    notify_url: notifyUrl,
  };
}

async function createPayment(order, urls) {
  const req = toPwvRequest(order, urls);
  if (config.mode === 'sandbox') return sandbox.create(req);

  const body = JSON.stringify(req);
  const res = await fetch(`${config.apiBase}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-PWV-Signature': signatureHeader(body),
      'Idempotency-Key': `${order.id}-${order.attempts}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`PWV create payment failed: HTTP ${res.status}`);
  const data = await res.json();
  return { paymentId: data.payment_id, checkoutUrl: data.checkout_url };
}

// ---------------------------------------------------------------------------
// Sandbox simulator: plays the role of PWV's servers + hosted cashier page.
// ---------------------------------------------------------------------------
const TEST_CARDS = {
  '4242424242424242': { ok: true },
  '5555555555554444': { ok: true },
  '4000000000000002': { ok: false, reason: 'card_declined' },
  '4000000000009995': { ok: false, reason: 'insufficient_funds' },
};

const sandbox = {
  async create(req) {
    const paymentId = 'pwv_' + crypto.randomBytes(9).toString('hex');
    await store.set('pwv:' + paymentId, { ...req, payment_id: paymentId, status: 'pending', created_at: new Date().toISOString() });
    return { paymentId, checkoutUrl: `/pwv-sandbox/checkout.html?pid=${paymentId}` };
  },

  async publicView(pid) {
    const p = await store.get('pwv:' + pid);
    if (!p) return null;
    return {
      payment_id: p.payment_id, status: p.status, merchant_id: p.merchant_id, merchant_name: 'LUXEVA Hair',
      merchant_order_no: p.merchant_order_no, amount: p.amount, currency: p.currency,
      description: p.description, line_items: p.line_items, discount_amount: p.discount_amount, shipping_amount: p.shipping_amount, customer_email: p.customer.email, return_url: p.return_url,
    };
  },

  // Decide the result, deliver the signed notification to the merchant, then hand back the redirect.
  // `deliver(rawBody, signatureHeader)` stands in for PWV's HTTP POST to notify_url, so the demo also
  // works on serverless hosts where the function cannot reliably call itself.
  async confirm(pid, { method, cardNumber, scenario }, deliver) {
    const p = await store.get('pwv:' + pid);
    if (!p) throw Object.assign(new Error('Payment not found'), { status: 404 });
    if (p.status !== 'pending') return { status: p.status, redirectUrl: p.return_url };

    let result;
    if (method === 'card') {
      const num = String(cardNumber || '').replace(/\D/g, '');
      if (!luhn(num)) throw Object.assign(new Error('Invalid card number'), { status: 400 });
      result = TEST_CARDS[num] || { ok: true };
    } else if (method === 'wallet') {
      result = scenario === 'fail' ? { ok: false, reason: 'wallet_payment_cancelled' } : { ok: true };
    } else {
      throw Object.assign(new Error('Unsupported method'), { status: 400 });
    }

    p.status = result.ok ? 'succeeded' : 'failed';
    p.method = method;
    await store.set('pwv:' + pid, p);
    const event = {
      id: 'evt_' + crypto.randomBytes(8).toString('hex'),
      type: result.ok ? 'payment.succeeded' : 'payment.failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        payment_id: p.payment_id, merchant_order_no: p.merchant_order_no, amount: p.amount, currency: p.currency,
        status: p.status, method, failure_reason: result.reason || null,
        card_last4: method === 'card' ? String(cardNumber).replace(/\D/g, '').slice(-4) : null,
      },
    };
    const body = JSON.stringify(event);
    try {
      await deliver(body, signatureHeader(body));
    } catch (e) {
      console.error('[pwv-sandbox] notification delivery failed:', e.message);
    }
    return { status: p.status, reason: result.reason || null, redirectUrl: p.return_url };
  },
};

function luhn(num) {
  if (!/^\d{12,19}$/.test(num)) return false;
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

module.exports = { config, createPayment, verifySignature, sandbox, TEST_CARDS };
