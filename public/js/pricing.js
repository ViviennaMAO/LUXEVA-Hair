// Shared pricing rules — loaded by the browser (window.Pricing) and by the server (require).
// The server always recomputes totals with this module; the browser copy is for display only.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CURRENCIES = {
    USD: { rate: 1, symbol: '$', label: 'USD $' },
    EUR: { rate: 0.92, symbol: '€', label: 'EUR €' },
    GBP: { rate: 0.79, symbol: '£', label: 'GBP £' },
    CAD: { rate: 1.37, symbol: 'C$', label: 'CAD C$' },
    AUD: { rate: 1.52, symbol: 'A$', label: 'AUD A$' },
  };

  // Base amounts are in USD; free-shipping threshold is evaluated on the USD subtotal.
  const SHIPPING = {
    standard: { label: 'Standard Shipping', eta: '7–12 business days', usd: 9.99, freeOverUsd: 99 },
    express: { label: 'DHL Express', eta: '3–5 business days', usd: 24.99 },
  };

  const COUPONS = {
    WELCOME10: { type: 'percent', value: 10, label: '10% off your first order' },
    HAIR20: { type: 'percent', value: 20, minUsd: 150, label: '20% off orders over $150' },
  };

  const COUNTRIES = [
    ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'],
    ['DE', 'Germany'], ['FR', 'France'], ['IT', 'Italy'], ['ES', 'Spain'], ['NL', 'Netherlands'],
    ['IE', 'Ireland'], ['SE', 'Sweden'], ['NZ', 'New Zealand'], ['ZA', 'South Africa'], ['NG', 'Nigeria'],
    ['AE', 'United Arab Emirates'], ['SG', 'Singapore'], ['JP', 'Japan'],
  ];

  function unitPriceUsd(product, opts) {
    let price = product.basePrice;
    if (product.lengths.length > 1) {
      const i = product.lengths.indexOf(Number(opts.length));
      if (i < 0) throw new Error('Invalid length for ' + product.id);
      price += i * product.lengthStep;
    }
    if (product.densities) {
      const d = product.densities.find((x) => x.value === opts.density);
      if (!d) throw new Error('Invalid density for ' + product.id);
      price += d.add;
    }
    return Math.round(price * 100) / 100;
  }

  // Minor units (cents) in the target currency.
  const toMinor = (usd, currency) => Math.round(usd * CURRENCIES[currency].rate * 100);

  function format(minor, currency) {
    const c = CURRENCIES[currency] || CURRENCIES.USD;
    return c.symbol + (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // lines: [{ product, length, density, qty }]
  function quote(lines, { currency = 'USD', shippingMethod = 'standard', coupon = '' } = {}) {
    if (!CURRENCIES[currency]) throw new Error('Unsupported currency');
    const ship = SHIPPING[shippingMethod];
    if (!ship) throw new Error('Unsupported shipping method');

    let subtotalUsd = 0;
    let subtotal = 0;
    const items = lines.map((l) => {
      const qty = Math.max(1, Math.min(10, Math.floor(Number(l.qty) || 1)));
      const usd = unitPriceUsd(l.product, l);
      const unit = toMinor(usd, currency);
      subtotalUsd += usd * qty;
      subtotal += unit * qty;
      return { id: l.product.id, name: l.product.name, image: l.product.image, length: l.length, density: l.density, capSize: l.capSize, qty, unit, total: unit * qty };
    });

    let discount = 0;
    let couponApplied = null;
    const c = COUPONS[String(coupon || '').trim().toUpperCase()];
    if (c && subtotalUsd >= (c.minUsd || 0)) {
      discount = Math.round((subtotal * c.value) / 100);
      couponApplied = { code: String(coupon).trim().toUpperCase(), label: c.label };
    }

    const freeShip = ship.freeOverUsd != null && subtotalUsd >= ship.freeOverUsd;
    const shipping = items.length && !freeShip ? toMinor(ship.usd, currency) : 0;
    return {
      currency, items, subtotal, discount, shipping, total: subtotal - discount + shipping,
      subtotalUsd: Math.round(subtotalUsd * 100) / 100, coupon: couponApplied, shippingMethod,
    };
  }

  return { CURRENCIES, SHIPPING, COUPONS, COUNTRIES, unitPriceUsd, toMinor, format, quote };
});
