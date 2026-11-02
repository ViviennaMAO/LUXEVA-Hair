/* LUXEVA Hair storefront — vanilla JS SPA with hash routing. */
(function () {
  const S = {
    catalog: null,
    config: null,
    currency: load('lx_currency', 'USD'),
    cart: load('lx_cart', []),
    coupon: '',
  };
  const app = document.getElementById('app');
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function load(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function persist(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (usd) => Pricing.format(Pricing.toMinor(usd, S.currency), S.currency);
  const minor = (m, cur = S.currency) => Pricing.format(m, cur);
  const product = (id) => S.catalog.products.find((p) => p.id === id);
  const stars = (r) => `<span class="stars" style="--r:${r}" aria-label="${r} out of 5 stars"></span>`;

  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function deliveryWindow(method = 'standard') {
    const [a, b] = method === 'express' ? [3, 5] : [7, 12];
    const add = (n) => { const d = new Date(); let c = 0; while (c < n) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) c++; } return d; };
    const f = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${f(add(a))} – ${f(add(b))}`;
  }

  // ---------------------------------------------------------------- cart
  const cartLines = () => S.cart.filter((l) => product(l.id)).map((l) => ({ ...l, product: product(l.id) }));
  const cartQuote = () => Pricing.quote(cartLines(), { currency: S.currency, coupon: S.coupon });

  function saveCart() {
    persist('lx_cart', S.cart);
    $('#cartCount').textContent = S.cart.reduce((n, l) => n + l.qty, 0);
    $('#cartCount').classList.toggle('show', S.cart.length > 0);
  }

  function addToCart(item) {
    const key = [item.id, item.length, item.density, item.capSize].join('|');
    const existing = S.cart.find((l) => l.key === key);
    if (existing) existing.qty = Math.min(10, existing.qty + item.qty);
    else S.cart.push({ key, ...item });
    saveCart();
  }

  function renderCart() {
    const d = $('#cartDrawer');
    const lines = cartLines();
    if (!lines.length) {
      d.innerHTML = `<div class="drawer-head"><h3>Your Bag</h3><button class="icon-btn" data-close>✕</button></div>
        <div class="empty"><div class="empty-ico">🛍</div><p>Your bag is empty.</p><a href="#/shop" class="btn btn-dark" data-close>Start shopping</a></div>`;
      return;
    }
    const q = cartQuote();
    const freeAt = Pricing.SHIPPING.standard.freeOverUsd;
    const left = Math.max(0, freeAt - q.subtotalUsd);
    d.innerHTML = `
      <div class="drawer-head"><h3>Your Bag (${lines.reduce((n, l) => n + l.qty, 0)})</h3><button class="icon-btn" data-close>✕</button></div>
      <div class="ship-progress">
        <p>${left > 0 ? `You're <b>${money(left)}</b> away from <b>free shipping</b>` : '🎉 You unlocked <b>free standard shipping</b>!'}</p>
        <div class="bar"><span style="width:${Math.min(100, (q.subtotalUsd / freeAt) * 100)}%"></span></div>
      </div>
      <div class="drawer-body">
        ${lines.map((l, i) => `
          <div class="line">
            <img src="${l.product.image}" alt="">
            <div class="line-info">
              <a href="#/p/${l.product.slug}" class="line-name" data-close>${esc(l.product.name)}</a>
              <div class="line-opts">${esc(optLabel(l))}</div>
              <div class="line-row">
                <div class="qty sm"><button data-qty="${i}" data-d="-1">−</button><span>${l.qty}</span><button data-qty="${i}" data-d="1">+</button></div>
                <b>${minor(q.items[i].total)}</b>
              </div>
              <button class="link-btn" data-remove="${i}">Remove</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="drawer-foot">
        <div class="sum-row"><span>Subtotal</span><b>${minor(q.subtotal)}</b></div>
        <p class="muted small">Shipping, duties & discounts calculated at checkout.</p>
        <a href="#/checkout" class="btn btn-dark btn-block" data-close>Checkout · ${minor(q.subtotal)}</a>
        <div class="secure-note">🔒 Secure checkout with <span class="pwv-badge sm">PWV<b>Pay</b></span></div>
      </div>`;
  }

  const optLabel = (l) => [l.product.lengths.length > 1 || l.product.hairType === 'Human Hair' ? `${l.length}"` : null, l.density, l.capSize].filter(Boolean).join(' · ');

  function openCart() { renderCart(); document.body.classList.add('cart-open'); }
  function closeCart() { document.body.classList.remove('cart-open'); }

  $('#cartDrawer').addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.close !== undefined) closeCart();
    if (t.dataset.qty !== undefined) {
      const l = S.cart[+t.dataset.qty];
      l.qty = Math.max(1, Math.min(10, l.qty + Number(t.dataset.d)));
      saveCart(); renderCart();
    }
    if (t.dataset.remove !== undefined) { S.cart.splice(+t.dataset.remove, 1); saveCart(); renderCart(); }
  });
  $('#drawerMask').addEventListener('click', closeCart);
  $('#cartBtn').addEventListener('click', openCart);

  // ---------------------------------------------------------------- components
  function card(p) {
    const off = Math.round((1 - p.basePrice / p.compareAt) * 100);
    return `
      <a class="card" href="#/p/${p.slug}">
        <div class="card-img">
          <img src="${p.image}" alt="${esc(p.name)}" loading="lazy">
          ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
          <span class="off">-${off}%</span>
        </div>
        <div class="card-body">
          <div class="card-meta">${esc(p.hairType)} · ${esc(p.texture)}</div>
          <h3>${esc(p.name)}</h3>
          <div class="rating">${stars(p.rating)}<span>${p.rating} (${p.reviews.toLocaleString()})</span></div>
          <div class="price"><b>${p.lengths.length > 1 ? '<small>From</small> ' : ''}${money(p.basePrice)}</b><s>${money(p.compareAt)}</s></div>
          <div class="sold">${esc(p.sold)} bought in past month</div>
        </div>
      </a>`;
  }

  // ---------------------------------------------------------------- views
  function viewHome() {
    const best = S.catalog.products.filter((p) => p.categories.includes('best'));
    const newIn = S.catalog.products.filter((p) => ['New', 'Trending'].includes(p.badge)).concat(S.catalog.products.slice(12, 16));
    return `
      <section class="hero" style="background-image:url(img/hero.jpg)">
        <div class="wrap hero-inner">
          <p class="eyebrow">New Season · HD Lace Collection</p>
          <h1>Hair that moves<br>like it's <em>yours.</em></h1>
          <p class="lead">100% virgin human hair wigs with invisible HD lace. Factory-direct prices, shipped to 17 countries.</p>
          <div class="hero-cta">
            <a href="#/shop?cat=best" class="btn btn-light">Shop Best Sellers</a>
            <a href="#/shop?cat=glueless" class="btn btn-ghost-light">Glueless Wigs →</a>
          </div>
        </div>
      </section>

      <section class="usp wrap">
        <div><span>✦</span><b>10A Virgin Hair</b><small>Unprocessed, cuticle aligned</small></div>
        <div><span>✈</span><b>Free Worldwide Shipping</b><small>On orders over $99</small></div>
        <div><span>↺</span><b>30-Day Returns</b><small>Unworn with lace uncut</small></div>
        <div><span>🔒</span><b>Secure PWV Checkout</b><small>Cards & PWV Wallet, multi-currency</small></div>
      </section>

      <section class="wrap section">
        <div class="section-head"><h2>Shop by Style</h2><a href="#/shop" class="more">View all →</a></div>
        <div class="cats">
          ${S.catalog.categories.map((c) => `
            <a class="cat" href="#/shop?cat=${c.id}">
              <img src="${c.image}" alt="" loading="lazy"><span>${esc(c.name)}</span>
            </a>`).join('')}
        </div>
      </section>

      <section class="wrap section">
        <div class="section-head"><h2>Best Sellers</h2><a href="#/shop?cat=best" class="more">Shop all →</a></div>
        <div class="grid">${best.map(card).join('')}</div>
      </section>

      <section class="promo" style="background-image:url(img/banner-wigs.jpg)">
        <div class="wrap promo-inner">
          <p class="eyebrow">Beginner Friendly</p>
          <h2>Wear & Go in 60 seconds.</h2>
          <p>Pre-cut lace, pre-plucked hairline, zero glue. Our glueless wigs are the easiest install you'll ever do.</p>
          <a href="#/shop?cat=glueless" class="btn btn-light">Shop Glueless</a>
        </div>
      </section>

      <section class="wrap section">
        <div class="section-head"><h2>New & Trending</h2><a href="#/shop" class="more">Shop all →</a></div>
        <div class="grid">${newIn.slice(0, 4).map(card).join('')}</div>
      </section>

      <section class="wrap section split">
        <img src="img/banner-showroom.jpg" alt="Our wig showroom" loading="lazy">
        <div>
          <p class="eyebrow dark">Factory Direct</p>
          <h2>From our studio to your door</h2>
          <p class="muted">Every LUXEVA wig is ventilated, plucked and quality-checked by hand in our own studio. By selling direct, we cut out the middlemen — so you get salon-grade hair at a fraction of retail prices.</p>
          <ul class="checks">
            <li>Ships in 24h from our fulfillment center</li>
            <li>Duties prepaid (DDP) for US, UK, EU, CA & AU</li>
            <li>Pay in your local currency with PWV Pay</li>
          </ul>
          <a href="#/page/shipping" class="btn btn-dark">Shipping info</a>
        </div>
      </section>

      <section class="wrap section">
        <div class="section-head center"><h2>Loved by 200,000+ customers</h2></div>
        <div class="reviews">
          ${[
            ['Danielle R.', 'US', 'Silk Press Straight 13x4', 'The HD lace literally disappeared on my skin. Arrived in 6 days to Texas, no shedding after 3 washes.'],
            ['Amara O.', 'UK', 'Deep Curly Glueless 5x5', 'First wig I ever installed myself. Took 2 minutes. Curls are so bouncy and paid in GBP, no surprise fees.'],
            ['Chloé M.', 'FR', 'Ash Blonde Balayage', 'The color is even prettier in person. Customer service helped me pick the right cap size.'],
          ].map(([n, c, prod, t]) => `
            <figure class="review">
              ${stars(5)}
              <blockquote>“${esc(t)}”</blockquote>
              <figcaption><b>${esc(n)}</b> · ${c} <span class="verified">✓ Verified buyer</span><br><small class="muted">${esc(prod)}</small></figcaption>
            </figure>`).join('')}
        </div>
      </section>`;
  }

  function viewShop(params) {
    const cat = params.get('cat') || '';
    const q = (params.get('q') || '').toLowerCase();
    const type = params.get('type') || '';
    const tex = params.get('tex') || '';
    const price = params.get('price') || '';
    const sort = params.get('sort') || 'featured';
    const all = S.catalog.products;
    const textures = [...new Set(all.map((p) => p.texture))].sort();
    const ranges = { u50: [0, 50], '50-100': [50, 100], '100-150': [100, 150], '150p': [150, 1e9] };

    let list = all.filter((p) =>
      (!cat || p.categories.includes(cat)) &&
      (!type || p.hairType === type) &&
      (!tex || p.texture === tex) &&
      (!price || (p.basePrice >= ranges[price][0] && p.basePrice < ranges[price][1])) &&
      (!q || [p.name, p.texture, p.color, p.lace, p.hairType].join(' ').toLowerCase().includes(q)));
    const sorters = {
      featured: () => 0,
      best: (a, b) => b.reviews - a.reviews,
      low: (a, b) => a.basePrice - b.basePrice,
      high: (a, b) => b.basePrice - a.basePrice,
      rating: (a, b) => b.rating - a.rating,
    };
    list = [...list].sort(sorters[sort] || sorters.featured);

    const catName = cat === 'best' ? 'Best Sellers' : (S.catalog.categories.find((c) => c.id === cat) || {}).name;
    const title = q ? `Results for “${esc(params.get('q'))}”` : catName || 'All Wigs & Extensions';
    const link = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); return '#/shop?' + p; };
    const opt = (k, v, label, cur) => `<a href="${link(k, cur === v ? '' : v)}" class="${cur === v ? 'on' : ''}">${label}</a>`;

    return `
      <div class="wrap crumbs"><a href="#/">Home</a> / <span>${title}</span></div>
      <div class="wrap shop">
        <aside class="filters">
          <h4>Category</h4>
          ${opt('cat', '', 'All', cat)}
          ${S.catalog.categories.map((c) => opt('cat', c.id, esc(c.name), cat)).join('')}
          <h4>Hair Type</h4>
          ${opt('type', 'Human Hair', 'Human Hair', type)}${opt('type', 'Synthetic', 'Synthetic', type)}
          <h4>Texture</h4>
          ${textures.map((t) => opt('tex', t, esc(t), tex)).join('')}
          <h4>Price (USD)</h4>
          ${opt('price', 'u50', 'Under $50', price)}${opt('price', '50-100', '$50 – $100', price)}${opt('price', '100-150', '$100 – $150', price)}${opt('price', '150p', '$150 & above', price)}
        </aside>
        <section>
          <div class="shop-bar">
            <h1>${title} <small>${list.length} items</small></h1>
            <label>Sort by
              <select id="sortSel">
                ${[['featured', 'Featured'], ['best', 'Best Selling'], ['rating', 'Avg. Customer Review'], ['low', 'Price: Low to High'], ['high', 'Price: High to Low']]
                  .map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </label>
          </div>
          ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty"><p>No products match these filters.</p><a class="btn btn-dark" href="#/shop">Clear filters</a></div>`}
        </section>
      </div>`;
  }

  function bindShop(params) {
    const sel = $('#sortSel');
    if (sel) sel.onchange = () => { const p = new URLSearchParams(params); p.set('sort', sel.value); location.hash = '#/shop?' + p; };
  }

  function viewProduct(slug) {
    const p = S.catalog.products.find((x) => x.slug === slug);
    if (!p) return viewNotFound();
    const related = S.catalog.products.filter((x) => x.id !== p.id && x.categories.some((c) => p.categories.includes(c) && c !== 'best')).slice(0, 4);
    const defaultLen = p.lengths[Math.min(2, p.lengths.length - 1)];
    return `
      <div class="wrap crumbs"><a href="#/">Home</a> / <a href="#/shop?cat=${p.categories[0]}">${esc((S.catalog.categories.find((c) => c.id === p.categories[0]) || { name: 'Shop' }).name)}</a> / <span>${esc(p.name)}</span></div>
      <div class="wrap pdp" data-id="${p.id}">
        <div class="gallery">
          <div class="thumbs">${p.gallery.map((g, i) => `<button class="${i ? '' : 'on'}" data-img="${g}"><img src="${g}" alt=""></button>`).join('')}</div>
          <div class="main-img"><img id="mainImg" src="${p.image}" alt="${esc(p.name)}">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</div>
        </div>
        <div class="buy">
          <div class="card-meta">${esc(p.hairType)} · SKU ${p.id}</div>
          <h1>${esc(p.name)}</h1>
          <div class="rating">${stars(p.rating)}<a href="#reviews" onclick="event.preventDefault();document.getElementById('reviews').scrollIntoView({behavior:'smooth'})">${p.rating} · ${p.reviews.toLocaleString()} ratings</a></div>
          <div class="sold">🔥 ${esc(p.sold)} bought in past month</div>
          <div class="pdp-price" id="pdpPrice"></div>

          <form id="buyForm">
            ${p.lengths.length > 1 ? `
              <div class="opt"><div class="opt-label">Length: <b id="lenLbl">${defaultLen}"</b></div>
                <div class="chips">${p.lengths.map((l) => `<label class="chip"><input type="radio" name="length" value="${l}" ${l === defaultLen ? 'checked' : ''}><span>${l}"</span></label>`).join('')}</div></div>`
              : `<input type="hidden" name="length" value="${p.lengths[0]}">`}
            ${p.densities ? `
              <div class="opt"><div class="opt-label">Density: <b id="denLbl">${p.densities[0].value}</b></div>
                <div class="chips">${p.densities.map((d, i) => `<label class="chip"><input type="radio" name="density" value="${d.value}" ${i ? '' : 'checked'}><span>${d.value}${d.add ? ` <small>+${money(d.add)}</small>` : ''}</span></label>`).join('')}</div></div>` : ''}
            <div class="opt"><div class="opt-label">Cap Size</div>
              <select name="capSize" class="select">${p.capSizes.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
            <div class="opt qty-row">
              <div class="qty"><button type="button" data-d="-1">−</button><input name="qty" value="1" readonly><button type="button" data-d="1">+</button></div>
              <button class="btn btn-dark grow" name="add">Add to Bag</button>
            </div>
            <button class="btn btn-accent btn-block" name="buy">Buy Now with <span class="pwv-badge inv">PWV<b>Pay</b></span></button>
          </form>

          <div class="delivery">
            <div>✈ <b>Free standard shipping</b> over $99 · Arrives <b>${deliveryWindow()}</b></div>
            <div>⚡ DHL Express available · Arrives <b>${deliveryWindow('express')}</b></div>
            <div>↺ 30-day returns · 🔒 Secure payment via PWV</div>
          </div>

          <ul class="highlights">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        </div>
      </div>

      <div class="wrap tabs-wrap">
        <div class="tabs">
          <section><h3>Description</h3><p>${esc(p.description)}</p></section>
          <section><h3>Specifications</h3>
            <table class="specs">
              ${[['Hair Type', p.hairType], ['Texture', p.texture], ['Color', p.color], ['Lace / Construction', p.lace],
                ['Available Lengths', p.lengths.map((l) => l + '"').join(', ')], ['Density', p.densities ? p.densities.map((d) => d.value).join(' / ') : '150%'],
                ['Cap Size', p.capSizes.join(', ')], ['Ships From', 'Global fulfillment center (24h dispatch)']]
                .map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}
            </table></section>
          <section><h3>Shipping & Returns</h3>
            <p>Standard shipping (7–12 business days) is free on orders over $99, otherwise ${money(Pricing.SHIPPING.standard.usd)}. DHL Express (3–5 business days) is ${money(Pricing.SHIPPING.express.usd)}. Import duties are prepaid for US, UK, EU, CA and AU. Returns accepted within 30 days for unworn wigs with uncut lace.</p></section>
        </div>
        <div class="pdp-reviews" id="reviews">
          <h3>Customer Reviews</h3>
          <div class="review-summary"><div class="big">${p.rating}</div>${stars(p.rating)}<span class="muted">${p.reviews.toLocaleString()} global ratings</span></div>
          ${[[5, 72], [4, 18], [3, 6], [2, 2], [1, 2]].map(([s, pct]) => `<div class="hist"><span>${s} star</span><div class="bar"><span style="width:${pct}%"></span></div><span>${pct}%</span></div>`).join('')}
          <p class="muted small">Sample reviews shown for demo purposes.</p>
        </div>
      </div>

      ${related.length ? `<section class="wrap section"><div class="section-head"><h2>You may also like</h2></div><div class="grid">${related.map(card).join('')}</div></section>` : ''}`;
  }

  function bindProduct(slug) {
    const p = S.catalog.products.find((x) => x.slug === slug);
    if (!p) return;
    const form = $('#buyForm');
    const read = () => {
      const f = new FormData(form);
      return { id: p.id, length: Number(f.get('length')), density: f.get('density') || null, capSize: f.get('capSize'), qty: Number(f.get('qty')) };
    };
    const update = () => {
      const o = read();
      const usd = Pricing.unitPriceUsd(p, o);
      const cmp = usd * (p.compareAt / p.basePrice);
      $('#pdpPrice').innerHTML = `<span class="save">-${Math.round((1 - usd / cmp) * 100)}%</span><b>${money(usd)}</b><span class="was">List: <s>${money(cmp)}</s></span>`;
      if ($('#lenLbl')) $('#lenLbl').textContent = o.length + '"';
      if ($('#denLbl')) $('#denLbl').textContent = o.density;
    };
    form.addEventListener('change', update);
    $$('.qty button', form).forEach((b) => (b.onclick = () => {
      const i = form.qty;
      i.value = Math.max(1, Math.min(10, Number(i.value) + Number(b.dataset.d)));
    }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addToCart(read());
      if (e.submitter && e.submitter.name === 'buy') location.hash = '#/checkout';
      else { toast('Added to your bag ✓'); openCart(); }
    });
    $$('.thumbs button').forEach((b) => (b.onclick = () => {
      $('#mainImg').src = b.dataset.img;
      $$('.thumbs button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    update();
  }

  function viewCheckout() {
    if (!cartLines().length) {
      return `<div class="wrap narrow empty"><div class="empty-ico">🛍</div><h2>Your bag is empty</h2><a href="#/shop" class="btn btn-dark">Continue shopping</a></div>`;
    }
    const saved = load('lx_address', {});
    const v = (k) => esc(saved[k] || '');
    return `
      <div class="wrap crumbs"><a href="#/">Home</a> / <span>Checkout</span></div>
      <div class="wrap checkout">
        <form id="checkoutForm" class="co-main" novalidate>
          <h2>Contact</h2>
          <input class="input" name="email" type="email" placeholder="Email for order updates" value="${v('email')}" required>
          <h2>Shipping address</h2>
          <select class="input" name="country" required>
            ${S.config.countries.map(([c, n]) => `<option value="${c}" ${c === (saved.country || 'US') ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <div class="row2">
            <input class="input" name="firstName" placeholder="First name" value="${v('firstName')}" required>
            <input class="input" name="lastName" placeholder="Last name" value="${v('lastName')}" required>
          </div>
          <input class="input" name="address1" placeholder="Street address" value="${v('address1')}" required>
          <input class="input" name="address2" placeholder="Apartment, suite, etc. (optional)" value="${v('address2')}">
          <div class="row3">
            <input class="input" name="city" placeholder="City" value="${v('city')}" required>
            <input class="input" name="state" placeholder="State / Province" value="${v('state')}">
            <input class="input" name="postalCode" placeholder="ZIP / Postal code" value="${v('postalCode')}" required>
          </div>
          <input class="input" name="phone" type="tel" placeholder="Phone (for courier)" value="${v('phone')}" required>

          <h2>Shipping method</h2>
          <div class="ship-opts" id="shipOpts"></div>

          <h2>Payment</h2>
          <div class="pay-box">
            <label class="pay-opt on">
              <input type="radio" name="pay" value="pwv" checked>
              <span class="pwv-badge lg">PWV<b>Pay</b></span>
              <span class="pay-desc">Cards, PWV Wallet & local methods · Pay in ${S.currency}</span>
              <span class="cards"><i>VISA</i><i>MC</i><i>AMEX</i><i>JCB</i></span>
            </label>
            <p class="muted small">After clicking “Pay”, you'll be redirected to PWV's secure checkout to complete your purchase. We never see or store your card details.</p>
            ${S.config.pwv.mode === 'sandbox' ? '<p class="sandbox-note">Sandbox mode — no real money will be charged.</p>' : ''}
          </div>
          <p class="form-error" id="coError"></p>
          <button class="btn btn-accent btn-block btn-lg" id="payBtn">Pay with PWV</button>
        </form>
        <aside class="co-summary" id="coSummary"></aside>
      </div>`;
  }

  function bindCheckout() {
    const form = $('#checkoutForm');
    if (!form) return;
    let method = 'standard';

    const renderSummary = () => {
      const q = Pricing.quote(cartLines(), { currency: S.currency, shippingMethod: method, coupon: S.coupon });
      $('#shipOpts').innerHTML = Object.entries(Pricing.SHIPPING).map(([k, s]) => {
        const sq = Pricing.quote(cartLines(), { currency: S.currency, shippingMethod: k, coupon: S.coupon });
        return `<label class="ship-opt ${k === method ? 'on' : ''}"><input type="radio" name="ship" value="${k}" ${k === method ? 'checked' : ''}>
          <span><b>${s.label}</b><small>${s.eta} · Arrives ${deliveryWindow(k)}</small></span>
          <b>${sq.shipping ? minor(sq.shipping) : 'FREE'}</b></label>`;
      }).join('');
      $('#coSummary').innerHTML = `
        <h3>Order summary</h3>
        ${q.items.map((i) => `
          <div class="sum-item">
            <div class="thumb"><img src="${i.image}" alt=""><span>${i.qty}</span></div>
            <div><div class="line-name">${esc(i.name)}</div><div class="line-opts">${esc(optLabel({ ...i, product: product(i.id) }))}</div></div>
            <b>${minor(i.total)}</b>
          </div>`).join('')}
        <form class="coupon" id="couponForm">
          <input class="input" name="code" placeholder="Discount code" value="${esc(S.coupon)}">
          <button class="btn btn-outline">Apply</button>
        </form>
        ${S.coupon && !q.coupon ? '<p class="form-error">This code is not valid for your cart.</p>' : ''}
        <div class="sum-row"><span>Subtotal</span><span>${minor(q.subtotal)}</span></div>
        ${q.discount ? `<div class="sum-row green"><span>Discount (${esc(q.coupon.code)})</span><span>−${minor(q.discount)}</span></div>` : ''}
        <div class="sum-row"><span>Shipping</span><span>${q.shipping ? minor(q.shipping) : 'FREE'}</span></div>
        <div class="sum-row"><span>Duties & taxes</span><span>Included</span></div>
        <div class="sum-row total"><span>Total</span><span><small>${S.currency}</small> ${minor(q.total)}</span></div>
        <div class="secure-note">🔒 SSL encrypted · Processed by PWV</div>`;
      $('#couponForm').onsubmit = (e) => { e.preventDefault(); S.coupon = e.target.code.value.trim(); renderSummary(); if (S.coupon) toast(Pricing.quote(cartLines(), { currency: S.currency, coupon: S.coupon }).coupon ? 'Discount applied ✓' : 'Code not applicable'); };
      $('#payBtn').textContent = `Pay ${minor(q.total)} with PWV`;
    };

    $('#shipOpts').addEventListener('change', (e) => { method = e.target.value; renderSummary(); });
    renderSummary();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#coError');
      err.textContent = '';
      const invalid = $$('[required]', form).filter((i) => !i.value.trim() || (i.type === 'email' && !i.checkValidity()));
      $$('.input', form).forEach((i) => i.classList.toggle('bad', invalid.includes(i)));
      if (invalid.length) { err.textContent = 'Please complete the highlighted fields.'; invalid[0].focus(); return; }

      const f = Object.fromEntries(new FormData(form));
      persist('lx_address', f);
      const btn = $('#payBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Redirecting to PWV…';
      try {
        const res = await api('/api/orders', {
          method: 'POST',
          body: {
            email: f.email, currency: S.currency, shippingMethod: method, coupon: S.coupon,
            shipping: { firstName: f.firstName, lastName: f.lastName, address1: f.address1, address2: f.address2, city: f.city, state: f.state, postalCode: f.postalCode, country: f.country, phone: f.phone },
            items: S.cart.map(({ id, length, density, capSize, qty }) => ({ id, length, density, capSize, qty })),
          },
        });
        persist('lx_pending', res.orderId);
        location.href = res.checkoutUrl;
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        renderSummary();
      }
    });
  }

  function viewOrder() {
    return `<div class="wrap narrow" id="orderView"><div class="center pad"><span class="spinner dark"></span><p class="muted">Loading your order…</p></div></div>`;
  }

  async function bindOrder(id, params) {
    const token = params.get('token');
    const box = $('#orderView');
    let tries = 0;
    const tick = async () => {
      if (!document.body.contains(box)) return;
      let o;
      try { o = await api(`/api/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token || '')}`); }
      catch (e) { box.innerHTML = `<div class="empty"><h2>Order not found</h2><p class="muted">${esc(e.message)}</p><a href="#/" class="btn btn-dark">Back home</a></div>`; return; }

      if (o.status === 'paid' && load('lx_pending', null) === o.id) {
        S.cart = []; S.coupon = ''; saveCart(); persist('lx_pending', null);
      }
      box.innerHTML = orderHtml(o);
      const retry = $('#retryPay');
      if (retry) retry.onclick = async () => {
        retry.disabled = true;
        retry.innerHTML = '<span class="spinner"></span> Redirecting to PWV…';
        try { const r = await api(`/api/orders/${o.id}/pay?token=${encodeURIComponent(token)}`, { method: 'POST' }); location.href = r.checkoutUrl; }
        catch (e) { toast(e.message); retry.disabled = false; }
      };
      if (['created', 'awaiting_payment'].includes(o.status) && ++tries < 15) setTimeout(tick, 2000);
    };
    tick();
  }

  function orderHtml(o) {
    const reasons = { card_declined: 'Your card was declined by the issuing bank.', insufficient_funds: 'The card has insufficient funds.', wallet_payment_cancelled: 'The PWV Wallet payment was cancelled.' };
    const head = {
      paid: `<div class="status ok"><div class="status-ico">✓</div><h1>Thank you, ${esc(o.shipping.firstName)}!</h1><p>Your payment was received and order <b>${o.id}</b> is confirmed. A confirmation has been sent to <b>${esc(o.email)}</b>.</p></div>`,
      payment_failed: `<div class="status fail"><div class="status-ico">!</div><h1>Payment not completed</h1><p>${esc(reasons[o.failureReason] || 'Your payment could not be processed.')} Your order <b>${o.id}</b> is saved — you can try again.</p><button class="btn btn-accent" id="retryPay">Try again with PWV</button></div>`,
    }[o.status] || `<div class="status wait"><div class="status-ico"><span class="spinner dark"></span></div><h1>Confirming your payment…</h1><p>We're waiting for PWV to confirm order <b>${o.id}</b>. This usually takes a few seconds.</p><button class="btn btn-outline" id="retryPay">Return to PWV checkout</button></div>`;
    const pay = o.paymentEvents.filter((e) => e.type === 'payment.succeeded').pop();
    const s = o.shipping;
    return `${head}
      <div class="order-grid">
        <div class="order-card">
          <h3>Items</h3>
          ${o.items.map((i) => `<div class="sum-item"><div class="thumb"><img src="${i.image}" alt=""><span>${i.qty}</span></div><div><div class="line-name">${esc(i.name)}</div><div class="line-opts">${i.length}"${i.density ? ' · ' + esc(i.density) : ''} · ${esc(i.capSize)}</div></div><b>${minor(i.total, o.currency)}</b></div>`).join('')}
          <div class="sum-row"><span>Subtotal</span><span>${minor(o.subtotal, o.currency)}</span></div>
          ${o.discount ? `<div class="sum-row green"><span>Discount</span><span>−${minor(o.discount, o.currency)}</span></div>` : ''}
          <div class="sum-row"><span>Shipping (${esc(Pricing.SHIPPING[o.shippingMethod].label)})</span><span>${o.shippingFee ? minor(o.shippingFee, o.currency) : 'FREE'}</span></div>
          <div class="sum-row total"><span>Total</span><span><small>${o.currency}</small> ${minor(o.total, o.currency)}</span></div>
        </div>
        <div class="order-card">
          <h3>Shipping to</h3>
          <p>${esc(s.firstName)} ${esc(s.lastName)}<br>${esc(s.address1)}${s.address2 ? ', ' + esc(s.address2) : ''}<br>${esc(s.city)}${s.state ? ', ' + esc(s.state) : ''} ${esc(s.postalCode)}<br>${esc((S.config.countries.find(([c]) => c === s.country) || [, s.country])[1])}</p>
          <h3>Payment</h3>
          <p><span class="pwv-badge sm">PWV<b>Pay</b></span> ${pay ? (pay.method === 'card' ? `Card •••• ${esc(pay.last4)}` : 'PWV Wallet') : '—'}<br>
          <small class="muted">${o.paymentId ? 'Payment ID: ' + esc(o.paymentId) : ''}</small></p>
          <h3>Status</h3>
          <p><span class="pill ${o.status}">${esc(o.status.replace('_', ' '))}</span></p>
        </div>
      </div>
      <div class="center"><a href="#/shop" class="btn btn-dark">Continue shopping</a></div>`;
  }

  const PAGES = {
    shipping: ['Shipping & Duties', `
      <p>We ship to 17 countries from our global fulfillment center. Orders placed before 2pm (GMT+8) ship the same day.</p>
      <table class="specs"><tr><th>Method</th><th>Time</th><th>Cost</th></tr>
      <tr><td>Standard</td><td>7–12 business days</td><td>${money(9.99)} · FREE over ${money(99)}</td></tr>
      <tr><td>DHL Express</td><td>3–5 business days</td><td>${money(24.99)}</td></tr></table>
      <p><b>Duties & taxes:</b> prepaid (DDP) for the United States, United Kingdom, EU, Canada and Australia — no surprise fees on delivery. Other destinations may be charged import duties by local customs.</p>`],
    returns: ['Returns & Refunds', `<p>Changed your mind? Return unworn wigs with uncut lace and original packaging within <b>30 days</b> of delivery. Refunds are issued back to your original PWV payment method within 5–7 business days after we receive the item.</p><p>For hygiene reasons, wigs that have been worn, cut, dyed or styled cannot be returned unless defective.</p>`],
    payment: ['Payment with PWV Pay', `<p>All payments are securely processed by <b>PWV</b>. At checkout you'll be redirected to PWV's hosted cashier where you can pay with Visa, Mastercard, American Express, JCB, or your PWV Wallet.</p>
      <ul class="checks"><li>Pay in USD, EUR, GBP, CAD or AUD — the price you see is the price you pay</li><li>3-D Secure authentication & PCI-DSS compliant</li><li>We never see or store your full card details</li></ul>`],
    faq: ['FAQ', [
      ['What does “HD lace” mean?', 'HD (high-definition) lace is an ultra-thin Swiss lace that becomes virtually invisible on all skin tones.'],
      ['Which density should I choose?', '150% is natural everyday volume, 180% is fuller, 250% is extra-glam. Most customers pick 180%.'],
      ['How do I measure my cap size?', 'Measure around your head from the front hairline, behind the ears, across the nape and back. 22.5" is Average and fits most.'],
      ['Can I dye or bleach human hair wigs?', 'Yes — all our human hair wigs can be colored. We recommend a professional stylist for lighter shades.'],
      ['Which payment methods do you accept?', 'We accept all major cards and PWV Wallet through PWV Pay, in five currencies.'],
    ].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')],
  };

  function viewPage(name) {
    const pg = PAGES[name];
    if (!pg) return viewNotFound();
    return `<div class="wrap crumbs"><a href="#/">Home</a> / <span>${pg[0]}</span></div><article class="wrap narrow page"><h1>${pg[0]}</h1>${pg[1]}</article>`;
  }

  const viewNotFound = () => `<div class="wrap narrow empty"><h2>Page not found</h2><a href="#/" class="btn btn-dark">Back home</a></div>`;

  // ---------------------------------------------------------------- router
  function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, qs] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    const [r, arg] = parts;
    closeCart();
    document.body.classList.remove('nav-open');
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + raw));

    if (!r) app.innerHTML = viewHome();
    else if (r === 'shop') { app.innerHTML = viewShop(params); bindShop(params); }
    else if (r === 'p') { app.innerHTML = viewProduct(arg); bindProduct(arg); }
    else if (r === 'checkout') { app.innerHTML = viewCheckout(); bindCheckout(); }
    else if (r === 'order') { app.innerHTML = viewOrder(); bindOrder(arg, params); }
    else if (r === 'page') app.innerHTML = viewPage(arg);
    else app.innerHTML = viewNotFound();
    $('#searchInput').value = r === 'shop' ? params.get('q') || '' : '';
    window.scrollTo(0, 0);
  }

  async function init() {
    [S.catalog, S.config] = await Promise.all([api('/api/catalog'), api('/api/config')]);
    if (!Pricing.CURRENCIES[S.currency]) S.currency = 'USD';
    const cs = $('#currencySelect');
    cs.innerHTML = Object.entries(Pricing.CURRENCIES).map(([k, c]) => `<option value="${k}" ${k === S.currency ? 'selected' : ''}>${c.label}</option>`).join('');
    cs.onchange = () => { S.currency = cs.value; persist('lx_currency', S.currency); route(); if (document.body.classList.contains('cart-open')) renderCart(); };
    $('#searchForm').onsubmit = (e) => { e.preventDefault(); const q = $('#searchInput').value.trim(); location.hash = '#/shop' + (q ? '?q=' + encodeURIComponent(q) : ''); };
    $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
    window.addEventListener('hashchange', route);
    saveCart();
    route();
  }

  window.App = { toast };
  init();
})();
