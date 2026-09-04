async function loadHome() {
  try {
    const banners = await api('/api/banners');
    if (banners[0]) {
      qs('#hero-img').src = banners[0].image || '/img/placeholder/outerwear.svg';
    }
  } catch {}

  const cats = await api('/api/categories');
  const catRow = qs('#cat-row');
  catRow.innerHTML = cats.map((c) => `
    <a class="cat-chip" href="/category.html?cat=${c.slug}">
      <img src="/img/placeholder/${c.slug}.svg" alt="" style="aspect-ratio:1/1;object-fit:cover;border-radius:2px;margin-bottom:10px;" />
      <div class="n">${c.name}</div>
    </a>`).join('');

  const products = await api('/api/products');
  qs('#featured-grid').innerHTML = products.slice(0, 8).map(productCardHTML).join('');
}

function productCardHTML(p) {
  const swatches = (p.colors || []).slice(0, 4).map((c) => `<span class="swatch-dot" title="${c}" style="background:${swatchColor(c)}"></span>`).join('');
  return `
  <a class="product-card" href="/product.html?slug=${p.slug}">
    <div class="thumb"><img src="${(p.images && p.images[0]) || '/img/placeholder/suits.svg'}" alt="${p.name}" loading="lazy"/></div>
    <div class="body">
      <div class="name">${p.name}</div>
      <div class="meta">${p.fit || ''} &middot; ${p.occasion || ''}</div>
      <div class="swatches">${swatches}</div>
      <div class="price">${money(p.base_price)} ${!p.inStock ? '<span class="oos-badge">Out of stock</span>' : ''}</div>
    </div>
  </a>`;
}

function swatchColor(name) {
  const map = { Navy: '#1F2A44', Charcoal: '#3A3A3A', Grey: '#9A9A9A', White: '#FFFFFF', 'Sky Blue': '#A9C6E8',
    Olive: '#6B6B3A', Beige: '#D8C9A3', Black: '#1A1A1A', Khaki: '#BFA76F', Stone: '#B9AF9A', Camel: '#C19A6B',
    Brown: '#5B3A29', Maroon: '#6E2E2A', Tan: '#D2B48C' };
  return map[name] || '#8B8578';
}

if (document.getElementById('cat-row')) loadHome();
