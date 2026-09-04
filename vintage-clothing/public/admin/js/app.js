const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
function money(n) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

async function aapi(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (opts.expectBlob) { if (!res.ok) throw new Error('Request failed'); return res.blob(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

let ME = null;

async function init() {
  try { ME = await aapi('/api/admin/me'); }
  catch { location.href = '/admin/login.html'; return; }

  qs('#who-box').innerHTML = `Signed in as<br><strong>${ME.name}</strong> &middot; ${ME.role}<br><a href="#" id="logout" style="text-decoration:underline;">Sign out</a>`;
  qs('#logout').addEventListener('click', async (e) => { e.preventDefault(); await aapi('/api/admin/logout', { method: 'POST' }); location.href = '/admin/login.html'; });

  if (ME.role !== 'owner') {
    qsa('#side-nav a[data-role="owner"]').forEach((a) => a.remove());
  }

  window.addEventListener('hashchange', route);
  route();
}

const LOADERS = {
  dashboard: loadDashboard, products: loadProducts, orders: loadOrders, returns: loadReturns,
  customers: loadCustomers, marketing: loadMarketing, import: loadImport, staff: loadStaff,
};

function route() {
  let hash = (location.hash || '#dashboard').slice(1);
  if (ME.role !== 'owner' && hash !== 'orders') hash = 'orders';
  qsa('.section').forEach((s) => s.classList.remove('active'));
  qsa('#side-nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + hash));
  const sec = qs('#sec-' + hash);
  if (!sec) return;
  sec.classList.add('active');
  LOADERS[hash] && LOADERS[hash](sec);
}

/* ================= DASHBOARD ================= */
async function loadDashboard(sec) {
  sec.innerHTML = `<div class="admin-header"><h1>Dashboard</h1></div><div id="dash-body">Loading…</div>`;
  const [analytics, lowStock] = await Promise.all([aapi('/api/admin/analytics'), aapi('/api/admin/low-stock')]);
  const maxRev = Math.max(1, ...analytics.revenueByDay.map((d) => d.revenue));
  qs('#dash-body').innerHTML = `
    <div class="grid-4">
      <div class="card stat"><div class="label">Total Revenue</div><div class="value">${money(analytics.totals.revenue)}</div></div>
      <div class="card stat"><div class="label">Total Orders</div><div class="value">${analytics.totals.orderCount}</div></div>
      <div class="card stat"><div class="label">Low Stock SKUs</div><div class="value" style="color:${analytics.lowStockCount ? 'var(--maroon)' : 'inherit'}">${analytics.lowStockCount}</div></div>
      <div class="card stat"><div class="label">Order Statuses</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">${analytics.statusCounts.map((s) => `<span class="badge ${s.status}">${s.status} ${s.c}</span>`).join('')}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;">
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px;">Revenue — last 14 days</h3>
        <div style="display:flex;align-items:flex-end;gap:6px;height:140px;">
          ${analytics.revenueByDay.map((d) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;" title="${d.day}: ${money(d.revenue)}">
              <div style="width:100%;background:var(--brass);border-radius:2px 2px 0 0;height:${Math.max(3, (d.revenue / maxRev) * 110)}px;"></div>
              <div style="font-size:9.5px;color:var(--muted);">${d.day.slice(5)}</div>
            </div>`).join('') || '<p style="color:var(--muted);">No orders yet.</p>'}
        </div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px;">Best sellers</h3>
        <table><tbody>
          ${analytics.bestSellers.map((b) => `<tr><td>${b.name}</td><td style="text-align:right;">${b.unitsSold} sold</td></tr>`).join('') || '<tr><td>No sales yet</td></tr>'}
        </tbody></table>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px;">Top-performing sizes</h3>
        <table><tbody>
          ${analytics.topSizes.map((s) => `<tr><td>${s.size}</td><td style="text-align:right;">${s.unitsSold} sold</td></tr>`).join('') || '<tr><td>No sales yet</td></tr>'}
        </tbody></table>
      </div>
      <div class="card">
        <h3 style="margin:0 0 14px;font-size:15px;">Low stock alerts</h3>
        <table><tbody>
          ${lowStock.slice(0, 8).map((v) => `<tr><td>${v.product_name} — ${v.size}/${v.color}</td><td class="low-stock-row" style="text-align:right;">${v.stock} left</td></tr>`).join('') || '<tr><td>All stock levels healthy</td></tr>'}
        </tbody></table>
      </div>
    </div>
  `;
}

/* ================= PRODUCTS ================= */
async function loadProducts(sec) {
  sec.innerHTML = `<div class="admin-header"><h1>Catalog &amp; Inventory</h1><button class="btn brass" id="new-product">+ New product</button></div>
    <div class="card"><table><thead><tr><th>Product</th><th>Category</th><th>Fit</th><th>Price</th><th>Variants</th><th>Stock</th><th></th></tr></thead><tbody id="prod-tbody"></tbody></table></div>`;
  const cats = await aapi('/api/categories');
  const products = await aapi('/api/admin/products');
  qs('#prod-tbody').innerHTML = products.map((p) => {
    const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
    const lowCount = p.variants.filter((v) => v.stock <= v.low_stock_threshold).length;
    return `<tr>
      <td>${p.name}</td>
      <td>${(cats.find((c) => c.id === p.category_id) || {}).name || '—'}</td>
      <td>${p.fit || '—'}</td>
      <td>${money(p.base_price)}</td>
      <td>${p.variants.length}</td>
      <td class="${lowCount ? 'low-stock-row' : ''}">${totalStock}${lowCount ? ` (${lowCount} low)` : ''}</td>
      <td><button class="btn sm outline" data-edit="${p.id}">Edit</button> <button class="btn sm danger" data-del="${p.id}">Delete</button></td>
    </tr>`;
  }).join('');

  qs('#new-product').addEventListener('click', () => openProductModal(null, cats, products));
  qsa('[data-edit]').forEach((b) => b.addEventListener('click', () => openProductModal(products.find((p) => p.id === b.dataset.edit), cats, products)));
  qsa('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this product and all its variants?')) return;
    await aapi('/api/admin/products/' + b.dataset.del, { method: 'DELETE' });
    loadProducts(sec);
  }));
}

function openProductModal(product, cats, allProducts) {
  const isNew = !product;
  let variants = product ? product.variants.map((v) => ({ ...v })) : [{ size: '', color: '', sku: '', price: '', stock: 0, low_stock_threshold: 3 }];
  const backdrop = el(`<div class="modal-backdrop"><div class="modal">
    <h3 style="margin-bottom:16px;">${isNew ? 'New product' : 'Edit product'}</h3>
    <div class="field"><label>Name</label><input id="pf-name" value="${product?.name || ''}" /></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="field"><label>Category</label><select id="pf-cat">${cats.map((c) => `<option value="${c.id}" ${product?.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
      <div class="field"><label>Base price</label><input id="pf-price" type="number" value="${product?.base_price || ''}" /></div>
      <div class="field"><label>Fit</label><select id="pf-fit">${['Slim', 'Regular', 'Tailored'].map((f) => `<option ${product?.fit === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="field"><label>Occasion</label><select id="pf-occasion">${['Formal', 'Casual'].map((f) => `<option ${product?.occasion === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Description</label><textarea id="pf-desc" rows="2">${product?.description || ''}</textarea></div>
    <label style="font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;">Variants (size + color = SKU)</label>
    <div id="variant-rows" style="margin:10px 0;"></div>
    <button class="btn sm outline" id="add-variant-row" type="button">+ Add variant</button>
    <div id="pf-err"></div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button class="btn brass" id="pf-save">Save product</button>
      <button class="btn outline" id="pf-cancel">Cancel</button>
    </div>
  </div></div>`);
  document.body.appendChild(backdrop);

  function renderVariantRows() {
    qs('#variant-rows', backdrop).innerHTML = variants.map((v, i) => `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:6px;">
        <input placeholder="Size" value="${v.size}" data-vf="size" data-i="${i}" />
        <input placeholder="Color" value="${v.color}" data-vf="color" data-i="${i}" />
        <input placeholder="SKU (auto)" value="${v.sku || ''}" data-vf="sku" data-i="${i}" />
        <input placeholder="Price" type="number" value="${v.price}" data-vf="price" data-i="${i}" />
        <input placeholder="Stock" type="number" value="${v.stock}" data-vf="stock" data-i="${i}" />
        <button class="btn sm danger" data-rmv="${i}" type="button">×</button>
      </div>`).join('');
    qsa('[data-vf]', backdrop).forEach((inp) => inp.addEventListener('input', () => { variants[inp.dataset.i][inp.dataset.vf] = inp.value; }));
    qsa('[data-rmv]', backdrop).forEach((b) => b.addEventListener('click', () => { variants.splice(Number(b.dataset.rmv), 1); renderVariantRows(); }));
  }
  renderVariantRows();
  qs('#add-variant-row', backdrop).addEventListener('click', () => { variants.push({ size: '', color: '', sku: '', price: '', stock: 0, low_stock_threshold: 3 }); renderVariantRows(); });
  qs('#pf-cancel', backdrop).addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  qs('#pf-save', backdrop).addEventListener('click', async () => {
    const payload = {
      name: qs('#pf-name', backdrop).value, categoryId: qs('#pf-cat', backdrop).value,
      basePrice: qs('#pf-price', backdrop).value, fit: qs('#pf-fit', backdrop).value,
      occasion: qs('#pf-occasion', backdrop).value, description: qs('#pf-desc', backdrop).value,
      images: product?.images || [], variants,
    };
    try {
      if (isNew) await aapi('/api/admin/products', { method: 'POST', body: payload });
      else {
        await aapi('/api/admin/products/' + product.id, { method: 'PUT', body: payload });
        // sync variants: update existing, create new (ones without id)
        for (const v of variants) {
          if (v.id) await aapi('/api/admin/variants/' + v.id, { method: 'PUT', body: v });
          else await aapi('/api/admin/variants', { method: 'POST', body: { ...v, productId: product.id } });
        }
      }
      backdrop.remove();
      loadProducts(qs('#sec-products'));
    } catch (e) {
      qs('#pf-err', backdrop).innerHTML = `<div class="notice err">${e.message}</div>`;
    }
  });
}

/* ================= ORDERS ================= */
const ORDER_STATUSES = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
async function loadOrders(sec, statusFilter) {
  sec.innerHTML = `<div class="admin-header"><h1>Orders &amp; Shipping</h1></div>
    <div class="chip-row" id="status-chips" style="margin-bottom:16px;"></div>
    <div class="card"><table><thead><tr><th>Order #</th><th>Customer</th><th>Placed</th><th>Payment</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody id="ord-tbody"></tbody></table></div>`;
  const chips = ['all', ...ORDER_STATUSES];
  qs('#status-chips').innerHTML = chips.map((s) => `<span class="chip ${s === (statusFilter || 'all') ? 'active' : ''}" data-s="${s}">${s}</span>`).join('');
  qsa('.chip', sec).forEach((c) => c.addEventListener('click', () => loadOrders(sec, c.dataset.s)));

  const orders = await aapi('/api/admin/orders' + (statusFilter && statusFilter !== 'all' ? '?status=' + statusFilter : ''));
  qs('#ord-tbody').innerHTML = orders.map((o) => `
    <tr>
      <td>${o.order_number}</td>
      <td>${o.guest_name || '—'}<br><span style="color:var(--muted);font-size:12px;">${o.guest_phone || ''}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
      <td style="text-transform:capitalize;">${o.payment_method} &middot; ${o.payment_status}</td>
      <td>${money(o.total)}</td>
      <td><span class="badge ${o.status}">${o.status}</span></td>
      <td><button class="btn sm outline" data-view="${o.id}">View</button></td>
    </tr>`).join('') || `<tr><td colspan="7">No orders in this view.</td></tr>`;

  qsa('[data-view]').forEach((b) => b.addEventListener('click', () => openOrderModal(b.dataset.view, sec, statusFilter)));
}

async function openOrderModal(orderId, sec, statusFilter) {
  const { order, items, history } = await aapi('/api/admin/orders/' + orderId);
  const backdrop = el(`<div class="modal-backdrop"><div class="modal">
    <h3>${order.order_number}</h3>
    <p style="color:var(--muted);font-size:13px;">${order.guest_name} &middot; ${order.guest_phone} &middot; ${order.address_line1}, ${order.address_city}, ${order.address_state} ${order.address_pincode}</p>
    <table style="margin:14px 0;"><tbody>
      ${items.map((i) => `<tr><td>${i.name} (${i.size}/${i.color}) &times;${i.qty}</td><td style="text-align:right;">${money(i.price * i.qty)}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td style="text-align:right;"><strong>${money(order.total)}</strong></td></tr>
    </tbody></table>
    <div class="field"><label>Update status</label>
      <select id="status-select">${ORDER_STATUSES.map((s) => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;">
      <button class="btn brass" id="save-status">Update status</button>
      <button class="btn outline" id="print-slip">Print packing slip</button>
      <button class="btn outline" id="close-modal">Close</button>
    </div>
    <div id="status-msg"></div>
    <h4 style="margin-top:20px;font-size:13px;">History</h4>
    <ul style="font-size:12.5px;color:var(--muted);padding-left:18px;">
      ${history.map((h) => `<li>${new Date(h.created_at).toLocaleString('en-IN')} — ${h.status} ${h.note ? '(' + h.note + ')' : ''}</li>`).join('')}
    </ul>
  </div></div>`);
  document.body.appendChild(backdrop);
  qs('#close-modal', backdrop).addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  qs('#save-status', backdrop).addEventListener('click', async () => {
    await aapi(`/api/admin/orders/${orderId}/status`, { method: 'PUT', body: { status: qs('#status-select', backdrop).value } });
    qs('#status-msg', backdrop).innerHTML = `<div class="notice ok">Status updated. Customer would be notified by SMS/WhatsApp here.</div>`;
    loadOrders(sec, statusFilter);
  });
  qs('#print-slip', backdrop).addEventListener('click', () => window.open('/admin/packing-slip.html?order=' + orderId, '_blank'));
}

/* ================= RETURNS ================= */
async function loadReturns(sec) {
  sec.innerHTML = `<div class="admin-header"><h1>Returns &amp; Refunds</h1></div><div class="card"><table><thead><tr><th>Order</th><th>Type</th><th>Reason</th><th>Requested</th><th>Status</th><th></th></tr></thead><tbody id="ret-tbody"></tbody></table></div>`;
  const returns = await aapi('/api/admin/returns');
  qs('#ret-tbody').innerHTML = returns.map((r) => `
    <tr>
      <td>${r.order_number}</td><td style="text-transform:capitalize;">${r.type}</td><td>${r.reason || '—'}</td>
      <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
      <td><span class="badge">${r.status}</span></td>
      <td>
        ${r.status === 'requested' ? `<button class="btn sm outline" data-approve="${r.id}">Approve</button> <button class="btn sm danger" data-reject="${r.id}">Reject</button>` : ''}
        ${r.status === 'approved' ? `<button class="btn sm brass" data-refund="${r.id}">Mark refunded</button>` : ''}
      </td>
    </tr>`).join('') || `<tr><td colspan="6">No return/exchange requests yet.</td></tr>`;
  qsa('[data-approve]').forEach((b) => b.addEventListener('click', async () => { await aapi('/api/admin/returns/' + b.dataset.approve, { method: 'PUT', body: { status: 'approved' } }); loadReturns(sec); }));
  qsa('[data-reject]').forEach((b) => b.addEventListener('click', async () => { await aapi('/api/admin/returns/' + b.dataset.reject, { method: 'PUT', body: { status: 'rejected' } }); loadReturns(sec); }));
  qsa('[data-refund]').forEach((b) => b.addEventListener('click', async () => { await aapi('/api/admin/returns/' + b.dataset.refund, { method: 'PUT', body: { status: 'refunded' } }); loadReturns(sec); }));
}

/* ================= CUSTOMERS (CRM) ================= */
async function loadCustomers(sec) {
  sec.innerHTML = `<div class="admin-header"><h1>Customers</h1></div><div class="card"><table><thead><tr><th>Name</th><th>Contact</th><th>Orders</th><th>Lifetime spend</th><th>Joined</th></tr></thead><tbody id="cust-tbody"></tbody></table></div>`;
  const customers = await aapi('/api/admin/customers');
  qs('#cust-tbody').innerHTML = customers.map((c) => `
    <tr><td>${c.name || '—'}</td><td>${c.email}<br><span style="color:var(--muted);font-size:12px;">${c.phone || ''}</span></td>
    <td>${c.orderCount}</td><td>${money(c.lifetimeSpend)}</td><td>${new Date(c.created_at).toLocaleDateString('en-IN')}</td></tr>`).join('')
    || `<tr><td colspan="5">No registered customers yet — most orders are guest checkouts.</td></tr>`;
}

/* ================= MARKETING: coupons + banners ================= */
async function loadMarketing(sec) {
  sec.innerHTML = `<div class="admin-header"><h1>Coupons &amp; Banners</h1></div>
    <div class="tabs"><button class="active" data-tab="coupons">Coupons</button><button data-tab="banners">Homepage banner</button></div>
    <div id="mkt-body"></div>`;
  qsa('.tabs button', sec).forEach((b) => b.addEventListener('click', () => {
    qsa('.tabs button', sec).forEach((x) => x.classList.remove('active')); b.classList.add('active');
    b.dataset.tab === 'coupons' ? renderCoupons() : renderBanners();
  }));

  async function renderCoupons() {
    const coupons = await aapi('/api/admin/coupons');
    qs('#mkt-body').innerHTML = `
      <div class="card" style="margin-bottom:16px;"><table><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min order</th><th>Active</th><th></th></tr></thead><tbody>
        ${coupons.map((c) => `<tr><td>${c.code}</td><td>${c.type}</td><td>${c.type === 'percent' ? c.value + '%' : money(c.value)}</td><td>${money(c.min_order)}</td><td>${c.active ? 'Yes' : 'No'}</td>
          <td><button class="btn sm danger" data-delc="${c.code}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6">No coupons yet.</td></tr>'}
      </tbody></table></div>
      <div class="card" style="max-width:420px;">
        <h3 style="font-size:14px;margin-bottom:12px;">New coupon</h3>
        <form id="coupon-form">
          <div class="field"><label>Code</label><input name="code" required style="text-transform:uppercase;" /></div>
          <div class="field"><label>Type</label><select name="type"><option value="percent">Percent off</option><option value="flat">Flat amount off</option></select></div>
          <div class="field"><label>Value</label><input name="value" type="number" required /></div>
          <div class="field"><label>Minimum order (₹)</label><input name="minOrder" type="number" value="0" /></div>
          <div class="field"><label>Description</label><input name="description" placeholder="e.g. Buy 2 shirts, get 10% off" /></div>
          <button class="btn brass" type="submit">Create coupon</button>
        </form>
      </div>`;
    qs('#coupon-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await aapi('/api/admin/coupons', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      renderCoupons();
    });
    qsa('[data-delc]').forEach((b) => b.addEventListener('click', async () => { await aapi('/api/admin/coupons/' + b.dataset.delc, { method: 'DELETE' }); renderCoupons(); }));
  }

  async function renderBanners() {
    const banners = await aapi('/api/admin/banners');
    qs('#mkt-body').innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        ${banners.map((b) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);">
          <div><strong>${b.title}</strong><br><span style="color:var(--muted);font-size:12.5px;">${b.subtitle}</span></div>
          <button class="btn sm danger" data-delb="${b.id}">Delete</button></div>`).join('') || '<p>No banners.</p>'}
      </div>
      <div class="card" style="max-width:480px;">
        <h3 style="font-size:14px;margin-bottom:12px;">New homepage banner</h3>
        <form id="banner-form">
          <div class="field"><label>Title</label><input name="title" required /></div>
          <div class="field"><label>Subtitle</label><input name="subtitle" /></div>
          <div class="field"><label>Image URL (optional — placeholder used otherwise)</label><input name="image" placeholder="/img/placeholder/suits.svg" /></div>
          <button class="btn brass" type="submit">Add banner</button>
        </form>
      </div>`;
    qs('#banner-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await aapi('/api/admin/banners', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      renderBanners();
    });
    qsa('[data-delb]').forEach((b) => b.addEventListener('click', async () => { await aapi('/api/admin/banners/' + b.dataset.delb, { method: 'DELETE' }); renderBanners(); }));
  }
  renderCoupons();
}

/* ================= BULK IMPORT / EXPORT ================= */
async function loadImport(sec) {
  sec.innerHTML = `<div class="admin-header"><h1>Bulk Import / Export</h1></div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px;margin-bottom:8px;">Export current catalog</h3>
      <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">Downloads every product variant as a CSV — edit it in Excel/Sheets and re-import below.</p>
      <a class="btn outline" href="/api/admin/products/export">Download CSV</a>
    </div>
    <div class="card">
      <h3 style="font-size:14px;margin-bottom:8px;">Import CSV</h3>
      <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">Columns: product_name, category, fit, occasion, base_price, size, color, sku, price, stock, low_stock_threshold. Matching SKUs update existing variants; new SKUs are created (and new products, if the name is new).</p>
      <input type="file" id="csv-file" accept=".csv" style="margin-bottom:12px;" />
      <div><button class="btn brass" id="import-btn">Import</button></div>
      <div id="import-result" style="margin-top:12px;"></div>
    </div>`;
  qs('#import-btn').addEventListener('click', async () => {
    const file = qs('#csv-file').files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const res = await fetch('/api/admin/products/import', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      qs('#import-result').innerHTML = `<div class="notice ok">Processed ${data.rowsProcessed} rows — ${data.productsCreated} new products, ${data.variantsCreated} new variants, ${data.variantsUpdated} variants updated.</div>`;
    } catch (e) {
      qs('#import-result').innerHTML = `<div class="notice err">${e.message}</div>`;
    }
  });
}

/* ================= STAFF (owner only) ================= */
async function loadStaff(sec) {
  sec.innerHTML = `<div class="admin-header"><h1>Staff Access</h1></div>
    <div class="card" style="margin-bottom:16px;"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th></tr></thead><tbody id="staff-tbody"></tbody></table></div>
    <div class="card" style="max-width:420px;">
      <h3 style="font-size:14px;margin-bottom:12px;">Add staff login</h3>
      <p style="color:var(--muted);font-size:12.5px;margin-bottom:12px;">"Staff" logins (e.g. Packing Staff) only see Orders &amp; Shipping. "Owner" logins see everything.</p>
      <form id="staff-form">
        <div class="field"><label>Name</label><input name="name" required /></div>
        <div class="field"><label>Username</label><input name="username" required /></div>
        <div class="field"><label>Password</label><input name="password" type="password" required /></div>
        <div class="field"><label>Role</label><select name="role"><option value="staff">Staff (Orders &amp; Shipping only)</option><option value="owner">Owner (full access)</option></select></div>
        <button class="btn brass" type="submit">Create login</button>
      </form>
    </div>`;
  const staff = await aapi('/api/admin/staff');
  qs('#staff-tbody').innerHTML = staff.map((s) => `<tr><td>${s.username}</td><td>${s.name}</td><td style="text-transform:capitalize;">${s.role}</td></tr>`).join('');
  qs('#staff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await aapi('/api/admin/staff', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    loadStaff(sec);
  });
}

init();
