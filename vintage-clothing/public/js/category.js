const FILTER_OPTIONS = {
  size: ['S', 'M', 'L', 'XL', 'XXL', '30', '32', '34', '36', '38', '38R', '40R', '42R', '44R', '7', '8', '9', '10', '11'],
  color: ['Navy', 'Charcoal', 'Grey', 'White', 'Sky Blue', 'Olive', 'Beige', 'Black', 'Khaki', 'Stone', 'Camel', 'Brown', 'Maroon', 'Tan'],
  fit: ['Slim', 'Regular', 'Tailored'],
  occasion: ['Formal', 'Casual'],
};

function currentParams() {
  return new URLSearchParams(location.search);
}

function renderFilterGroup(id, key) {
  const params = currentParams();
  qs('#' + id).innerHTML = FILTER_OPTIONS[key].map((v) => `
    <label class="filter-option">
      <input type="radio" name="${key}" value="${v}" ${params.get(key) === v ? 'checked' : ''}/> ${v}
    </label>`).join('') + `<label class="filter-option"><input type="radio" name="${key}" value="" ${!params.get(key) ? 'checked' : ''}/> Any</label>`;
  qsa(`input[name="${key}"]`).forEach((inp) => inp.addEventListener('change', () => updateFilter(key, inp.value)));
}

function updateFilter(key, value) {
  const params = currentParams();
  if (value) params.set(key, value); else params.delete(key);
  location.search = params.toString();
}

async function loadCategory() {
  const params = currentParams();
  renderFilterGroup('f-size', 'size');
  renderFilterGroup('f-color', 'color');
  renderFilterGroup('f-fit', 'fit');
  renderFilterGroup('f-occasion', 'occasion');
  qs('#f-min').value = params.get('minPrice') || '';
  qs('#f-max').value = params.get('maxPrice') || '';
  qs('#sort-select').value = params.get('sort') || '';

  qs('#apply-price').addEventListener('click', () => {
    const p = currentParams();
    if (qs('#f-min').value) p.set('minPrice', qs('#f-min').value); else p.delete('minPrice');
    if (qs('#f-max').value) p.set('maxPrice', qs('#f-max').value); else p.delete('maxPrice');
    location.search = p.toString();
  });
  qs('#sort-select').addEventListener('change', (e) => {
    const p = currentParams();
    if (e.target.value) p.set('sort', e.target.value); else p.delete('sort');
    location.search = p.toString();
  });
  qs('#clear-filters').addEventListener('click', () => location.search = params.get('cat') ? `?cat=${params.get('cat')}` : '');

  if (params.get('cat')) {
    const cats = await api('/api/categories');
    const c = cats.find((x) => x.slug === params.get('cat'));
    if (c) { qs('#cat-heading').textContent = c.name; qs('#page-title').textContent = c.name + ' — The Vintage Clothing'; }
  } else if (params.get('q')) {
    qs('#cat-heading').textContent = `Results for "${params.get('q')}"`;
  }

  const products = await api('/api/products?' + params.toString());
  qs('#result-count').textContent = `${products.length} item${products.length === 1 ? '' : 's'}`;
  qs('#product-grid').innerHTML = products.length
    ? products.map(productCardHTML).join('')
    : `<div class="empty-state" style="grid-column:1/-1;">No products match these filters yet. Try clearing a filter.</div>`;
}

loadCategory();
