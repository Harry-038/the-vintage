let PRODUCT = null;
let selectedSize = null, selectedColor = null, qty = 1;

function swatchColorRef(name) {
  const map = { Navy: '#1F2A44', Charcoal: '#3A3A3A', Grey: '#9A9A9A', White: '#FFFFFF', 'Sky Blue': '#A9C6E8',
    Olive: '#6B6B3A', Beige: '#D8C9A3', Black: '#1A1A1A', Khaki: '#BFA76F', Stone: '#B9AF9A', Camel: '#C19A6B',
    Brown: '#5B3A29', Maroon: '#6E2E2A', Tan: '#D2B48C' };
  return map[name] || '#8B8578';
}

async function loadProduct() {
  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) { qs('#pdp-root').innerHTML = '<p>Product not found.</p>'; return; }
  try {
    PRODUCT = await api('/api/products/' + slug);
  } catch (e) {
    qs('#pdp-root').innerHTML = `<div class="empty-state">${e.message}</div>`;
    return;
  }
  qs('#page-title').textContent = PRODUCT.name + ' — The Vintage Clothing';
  selectedSize = PRODUCT.sizes[0];
  selectedColor = PRODUCT.colors[0];
  render();
}

function currentVariant() {
  return PRODUCT.variants.find((v) => v.size === selectedSize && v.color === selectedColor);
}

function render() {
  const variant = currentVariant();
  const images = (PRODUCT.images && PRODUCT.images.length) ? PRODUCT.images : ['/img/placeholder/suits.svg'];

  qs('#pdp-root').innerHTML = `
    <div class="pdp-gallery">
      <img src="${images[0]}" alt="${PRODUCT.name}" />
    </div>
    <div class="pdp-info">
      <div class="cat-tag">${PRODUCT.fit || ''} &middot; ${PRODUCT.occasion || ''}</div>
      <h1>${PRODUCT.name}</h1>
      <div class="price">${money(variant ? variant.price : PRODUCT.base_price)}</div>
      <p class="desc">${PRODUCT.description || ''}</p>

      <div class="option-row">
        <label class="title">Color — ${selectedColor}</label>
        <div class="option-pills" id="color-pills"></div>
      </div>
      <div class="option-row">
        <label class="title">Size — ${selectedSize} &nbsp;
          <button class="size-guide-link" id="open-size-guide">Size &amp; fit guide</button>
        </label>
        <div class="option-pills" id="size-pills"></div>
      </div>

      ${variant && variant.stock > 0 && variant.stock <= variant.low_stock_threshold
        ? `<div class="stock-note">Only ${variant.stock} left in this size/color — order soon.</div>` : ''}
      ${!variant || variant.stock === 0 ? `<div class="stock-note">This size/color is currently out of stock.</div>` : ''}

      <div class="qty-row">
        <div class="qty-control">
          <button id="qty-minus">−</button><span id="qty-val">${qty}</span><button id="qty-plus">+</button>
        </div>
        <button class="btn btn-brass btn-block" id="add-to-cart" style="flex:1;" ${!variant || variant.stock === 0 ? 'disabled' : ''}>
          ${!variant || variant.stock === 0 ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
      <div id="add-msg"></div>
    </div>
  `;

  qs('#size-pills').innerHTML = PRODUCT.sizes.map((s) => {
    const v = PRODUCT.variants.find((x) => x.size === s && x.color === selectedColor);
    const disabled = !v || v.stock === 0;
    return `<button class="pill ${s === selectedSize ? 'selected' : ''}" ${disabled ? 'disabled' : ''} data-size="${s}">${s}</button>`;
  }).join('');
  qs('#color-pills').innerHTML = PRODUCT.colors.map((c) => `
    <button class="pill ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="display:flex;align-items:center;gap:6px;">
      <span class="swatch-dot" style="background:${swatchColorRef(c)}"></span>${c}
    </button>`).join('');

  qsa('#size-pills .pill').forEach((b) => b.addEventListener('click', () => { if (!b.disabled) { selectedSize = b.dataset.size; render(); } }));
  qsa('#color-pills .pill').forEach((b) => b.addEventListener('click', () => {
    selectedColor = b.dataset.color;
    if (!PRODUCT.variants.find((x) => x.size === selectedSize && x.color === selectedColor)) {
      const alt = PRODUCT.variants.find((x) => x.color === selectedColor);
      if (alt) selectedSize = alt.size;
    }
    render();
  }));
  qs('#qty-minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); qs('#qty-val').textContent = qty; });
  qs('#qty-plus').addEventListener('click', () => { qty = qty + 1; qs('#qty-val').textContent = qty; });
  qs('#add-to-cart').addEventListener('click', () => {
    const v = currentVariant();
    if (!v || v.stock === 0) return;
    Cart.add({ variantId: v.id, productSlug: PRODUCT.slug, name: PRODUCT.name, size: v.size, color: v.color, price: v.price, image: images[0], qty });
    qs('#add-msg').innerHTML = `<div class="notice ok" style="margin-top:14px;">Added to cart. <a href="/cart.html" style="text-decoration:underline;">View cart →</a></div>`;
  });
  qs('#open-size-guide').addEventListener('click', openSizeGuide);
}

function openSizeGuide() {
  const backdrop = el(`<div class="modal-backdrop">
    <div class="modal" style="position:relative;">
      <button class="close-x">&times;</button>
      <h3>Size &amp; fit guide</h3>
      <p style="font-size:13.5px;color:var(--stone);margin-bottom:14px;">Measurements in inches. Measure over a well-fitted shirt for the most accurate result.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
        <thead><tr style="text-align:left;border-bottom:1px solid var(--line);"><th style="padding:8px 0;">Size</th><th>Chest</th><th>Waist</th><th>Sleeve</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--line);"><td style="padding:8px 0;">S / 38R</td><td>38–39</td><td>32–33</td><td>24.5</td></tr>
          <tr style="border-bottom:1px solid var(--line);"><td style="padding:8px 0;">M / 40R</td><td>40–41</td><td>34–35</td><td>25</td></tr>
          <tr style="border-bottom:1px solid var(--line);"><td style="padding:8px 0;">L / 42R</td><td>42–43</td><td>36–37</td><td>25.5</td></tr>
          <tr style="border-bottom:1px solid var(--line);"><td style="padding:8px 0;">XL / 44R</td><td>44–45</td><td>38–39</td><td>26</td></tr>
        </tbody>
      </table>
      <p style="font-size:12.5px;color:var(--stone);margin-top:14px;">Between sizes? For a Tailored fit, size down. For Regular, size up.</p>
    </div>
  </div>`);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  qs('.close-x', backdrop).addEventListener('click', () => backdrop.remove());
  document.body.appendChild(backdrop);
}

loadProduct();
