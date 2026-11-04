// Local ledger adapter only. No production payment endpoint is enabled here.
const crypto = require('node:crypto');
function settings() {
  const platform = new URL(process.env.PWV_LOCAL_PLATFORM_URL || 'http://localhost:3000');
  const api = new URL(process.env.PWV_LOCAL_PLATFORM_API || 'http://127.0.0.1:35080');
  const key = process.env.PWV_LOCAL_KEY || '';
  const review = process.env.PWV_LOCAL_REVIEW_ORIGIN;
  const privateHTTPS = u => u.protocol === 'https:' && /^192\.168\.\d{1,3}\.\d{1,3}$/.test(u.hostname) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash;
  const localHTTP = u => u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname) && u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password;
  if (process.env.PWV_MODE !== 'local-platform' || key.length < 32 ||
      !(localHTTP(api) && (localHTTP(platform) || (privateHTTPS(platform) && platform.origin === review))))
    throw new Error('Local platform mode requires loopback URLs and a private key');
  return { platform, api, key };
}
function paymentId(orderId) { return 'shop_' + crypto.createHash('sha256').update('luxeva:' + orderId).digest('hex').slice(0, 40); }
function create(order, { returnUrl }) {
  const { platform, key } = settings();
  const ret = new URL(returnUrl);
  const lanReturn = ret.protocol === 'https:' && /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ret.hostname) && ret.origin === process.env.PWV_LOCAL_REVIEW_SHOP_ORIGIN && !ret.username && !ret.password;
  if (!lanReturn && (!['localhost', '127.0.0.1'].includes(ret.hostname) || ret.protocol !== 'http:')) throw new Error('Local merchant URL required');
  if (order.currency !== 'USD') throw Object.assign(new Error('PWV wallet checkout currently requires USD. Select USD and retry.'), { status: 400 });
  const summary = order.items.map(i => `${i.name} · ${i.length} inch · ${i.density || 'standard'} · ${i.capSize} × ${i.qty}`).join('\n');
  const payload = Buffer.from(JSON.stringify({ order_id: order.id, amount_cents: order.total, currency: 'USD', summary, return_url: returnUrl, expires: Math.floor(Date.now()/1000) + 900 })).toString('base64url');
  const signature = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const url = new URL('/paycode/confirm', platform);
  url.search = new URLSearchParams({ shop_intent: payload + '.' + signature, lang: 'zh' });
  return { paymentId: paymentId(order.id), checkoutUrl: url.href };
}
async function receipt(order) {
  const { api, key } = settings();
  const res = await fetch(new URL('/api/v1/local-shop-receipts/' + paymentId(order.id), api), { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!res.ok) return null;
  const p = await res.json();
  if (p.payment_id !== paymentId(order.id) || p.merchant_order_no !== order.id || p.amount !== order.total || p.currency !== order.currency) throw Error('Platform receipt mismatch');
  return p;
}
module.exports = { create, receipt, settings };
