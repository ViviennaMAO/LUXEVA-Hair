const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PWV_MODE='local-platform';
process.env.PWV_LOCAL_KEY=crypto.randomBytes(32).toString('hex');
const adapter=require('../server/local-platform');
const order={id:'LXTEST',currency:'USD',total:12999,items:[{name:'Honey blonde',length:16,density:'150%',capSize:'Average',qty:1}]};
const urls={returnUrl:'http://localhost:5180/#/order/LXTEST?token=test'};
test('signed order uses server price/options and stable payment identity',()=>{const p=adapter.create(order,urls);const u=new URL(p.checkoutUrl);assert.equal(u.origin,'http://localhost:3000');const [raw,sig]=u.searchParams.get('shop_intent').split('.');assert.equal(sig,crypto.createHmac('sha256',process.env.PWV_LOCAL_KEY).update(raw).digest('base64url'));const intent=JSON.parse(Buffer.from(raw,'base64url'));assert.equal(intent.amount_cents,12999);assert.match(intent.summary,/16 inch/);assert.equal(adapter.create(order,urls).paymentId,p.paymentId);});
test('local mode rejects remote destinations and non-USD amounts',()=>{assert.throws(()=>adapter.create({...order,currency:'EUR'},urls));assert.throws(()=>adapter.create(order,{returnUrl:'https://mvp.parallelworld.com/'}));process.env.PWV_LOCAL_PLATFORM_URL='https://mvp.parallelworld.com';assert.throws(()=>adapter.settings());delete process.env.PWV_LOCAL_PLATFORM_URL;});
test('LAN review uses exact explicitly configured private HTTPS origins',()=>{
 process.env.PWV_LOCAL_PLATFORM_URL='https://192.168.1.154:3002';
 process.env.PWV_LOCAL_REVIEW_ORIGIN='https://192.168.1.154:3002';
 process.env.PWV_LOCAL_REVIEW_SHOP_ORIGIN='https://192.168.1.154:5181';
 try {
  const p=adapter.create(order,{returnUrl:'https://192.168.1.154:5181/#/order/LXTEST?token=test'});
  assert.equal(new URL(p.checkoutUrl).origin,'https://192.168.1.154:3002');
  assert.throws(()=>adapter.create(order,{returnUrl:'https://192.168.1.155:5181/#/order/LXTEST?token=test'}));
  process.env.PWV_LOCAL_REVIEW_ORIGIN='https://192.168.1.154:3003';
  assert.throws(()=>adapter.settings());
 } finally {delete process.env.PWV_LOCAL_PLATFORM_URL;delete process.env.PWV_LOCAL_REVIEW_ORIGIN;delete process.env.PWV_LOCAL_REVIEW_SHOP_ORIGIN;}
});
