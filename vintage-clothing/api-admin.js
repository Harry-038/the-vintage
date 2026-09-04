// api-admin.js — shop-owner dashboard API. Every route (except /api/admin/login) requires a session cookie.
const { db, hashPassword, verifyPassword, genId } = require('./db');
const { sendJSON, readJSON, readBody, parseCookies, setCookie, money } = require('./utils');

function getAdminFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies.vc_admin_session;
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row || !row.admin_id) return null;
  return db.prepare('SELECT id, username, role, name FROM admin_users WHERE id = ?').get(row.admin_id);
}

// Very small CSV helpers — good enough for a straightforward variant-per-row export/import.
function toCSV(rows, columns) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => esc(r[c])).join(',')));
  return lines.join('\n');
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // naive CSV split that respects simple quoted fields
    const cells = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cells[i] ?? '').trim());
    return obj;
  });
}

async function handleAdminApi(req, res, pathname, query) {
  if (!pathname.startsWith('/api/admin/')) return false;

  // ---- Login (no auth required) ----
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const { username, password } = await readJSON(req);
    const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return sendJSON(res, 401, { error: 'Invalid username or password' }), true;
    }
    const token = genId('asess');
    db.prepare('INSERT INTO sessions (token, admin_id) VALUES (?, ?)').run(token, admin.id);
    setCookie(res, 'vc_admin_session', token, { maxAge: 60 * 60 * 12 });
    return sendJSON(res, 200, { id: admin.id, username: admin.username, role: admin.role, name: admin.name }), true;
  }
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    setCookie(res, 'vc_admin_session', '', {});
    return sendJSON(res, 200, { ok: true }), true;
  }

  // ---- Everything below requires a logged-in admin ----
  const admin = getAdminFromReq(req);
  if (!admin) return sendJSON(res, 401, { error: 'Admin session required' }), true;

  if (pathname === '/api/admin/me' && req.method === 'GET') {
    return sendJSON(res, 200, admin), true;
  }

  // Role gate: staff (e.g. "Packing Staff") only get order + shipping routes.
  const staffAllowed = pathname === '/api/admin/me'
    || pathname.startsWith('/api/admin/orders')
    || pathname === '/api/admin/logout';
  if (admin.role !== 'owner' && !staffAllowed) {
    return sendJSON(res, 403, { error: 'Your role does not have access to this section' }), true;
  }

  // ---- Products & variants ----
  if (pathname === '/api/admin/products' && req.method === 'GET') {
    const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
    const out = products.map((p) => ({
      ...p, images: JSON.parse(p.images || '[]'),
      variants: db.prepare('SELECT * FROM variants WHERE product_id = ?').all(p.id),
    }));
    return sendJSON(res, 200, out), true;
  }

  if (pathname === '/api/admin/products' && req.method === 'POST') {
    const body = await readJSON(req);
    const id = genId('prod');
    const slug = (body.slug || body.name || id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    db.prepare(`INSERT INTO products (id, name, slug, category_id, description, fit, occasion, base_price, images, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, body.name, slug, body.categoryId || null, body.description || '', body.fit || '', body.occasion || '',
        Number(body.basePrice) || 0, JSON.stringify(body.images || []), body.active === false ? 0 : 1);
    (body.variants || []).forEach((v) => {
      db.prepare(`INSERT INTO variants (id, product_id, size, color, sku, price, stock, low_stock_threshold)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(genId('var'), id, v.size, v.color, v.sku || `${slug}-${v.size}-${v.color}`.toUpperCase(),
          Number(v.price) || Number(body.basePrice) || 0, Number(v.stock) || 0, Number(v.lowStockThreshold) || 3);
    });
    return sendJSON(res, 200, { id }), true;
  }

  const prodIdMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (prodIdMatch && req.method === 'PUT') {
    const id = prodIdMatch[1];
    const body = await readJSON(req);
    db.prepare(`UPDATE products SET name=?, description=?, fit=?, occasion=?, base_price=?, category_id=?, images=?, active=? WHERE id=?`)
      .run(body.name, body.description || '', body.fit || '', body.occasion || '', Number(body.basePrice) || 0,
        body.categoryId || null, JSON.stringify(body.images || []), body.active === false ? 0 : 1, id);
    return sendJSON(res, 200, { ok: true }), true;
  }
  if (prodIdMatch && req.method === 'DELETE') {
    db.prepare('DELETE FROM products WHERE id = ?').run(prodIdMatch[1]);
    return sendJSON(res, 200, { ok: true }), true;
  }

  // Variant add/update/delete
  if (pathname === '/api/admin/variants' && req.method === 'POST') {
    const v = await readJSON(req);
    const id = genId('var');
    db.prepare(`INSERT INTO variants (id, product_id, size, color, sku, price, stock, low_stock_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, v.productId, v.size, v.color, v.sku, Number(v.price) || 0, Number(v.stock) || 0, Number(v.lowStockThreshold) || 3);
    return sendJSON(res, 200, { id }), true;
  }
  const varIdMatch = pathname.match(/^\/api\/admin\/variants\/([^/]+)$/);
  if (varIdMatch && req.method === 'PUT') {
    const v = await readJSON(req);
    db.prepare('UPDATE variants SET size=?, color=?, sku=?, price=?, stock=?, low_stock_threshold=? WHERE id=?')
      .run(v.size, v.color, v.sku, Number(v.price) || 0, Number(v.stock) || 0, Number(v.lowStockThreshold) || 3, varIdMatch[1]);
    return sendJSON(res, 200, { ok: true }), true;
  }
  if (varIdMatch && req.method === 'DELETE') {
    db.prepare('DELETE FROM variants WHERE id = ?').run(varIdMatch[1]);
    return sendJSON(res, 200, { ok: true }), true;
  }

  // ---- Low stock ----
  if (pathname === '/api/admin/low-stock' && req.method === 'GET') {
    const rows = db.prepare(`SELECT v.*, p.name as product_name FROM variants v JOIN products p ON p.id = v.product_id
        WHERE v.stock <= v.low_stock_threshold ORDER BY v.stock ASC`).all();
    return sendJSON(res, 200, rows), true;
  }

  // ---- Bulk CSV import / export ----
  if (pathname === '/api/admin/products/export' && req.method === 'GET') {
    const rows = db.prepare(`SELECT p.name as product_name, c.slug as category, p.fit, p.occasion, p.base_price,
        v.size, v.color, v.sku, v.price, v.stock, v.low_stock_threshold
        FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id`).all();
    const csv = toCSV(rows, ['product_name', 'category', 'fit', 'occasion', 'base_price', 'size', 'color', 'sku', 'price', 'stock', 'low_stock_threshold']);
    res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="catalog-export.csv"' });
    return res.end(csv), true;
  }

  if (pathname === '/api/admin/products/import' && req.method === 'POST') {
    const raw = await readBody(req);
    const rows = parseCSV(raw);
    let created = 0, updated = 0, productsCreated = 0;
    const catCache = {};
    for (const row of rows) {
      let categoryId = null;
      if (row.category) {
        if (!catCache[row.category]) {
          let cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(row.category);
          if (!cat) {
            const id = genId('cat');
            db.prepare('INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)').run(id, row.category, row.category);
            cat = { id };
          }
          catCache[row.category] = cat.id;
        }
        categoryId = catCache[row.category];
      }
      let product = db.prepare('SELECT * FROM products WHERE name = ?').get(row.product_name);
      if (!product) {
        const id = genId('prod');
        const slug = row.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + id.slice(-4);
        db.prepare(`INSERT INTO products (id, name, slug, category_id, fit, occasion, base_price, images)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]')`)
          .run(id, row.product_name, slug, categoryId, row.fit || '', row.occasion || '', Number(row.base_price) || 0);
        product = { id };
        productsCreated++;
      }
      const existingVariant = row.sku ? db.prepare('SELECT * FROM variants WHERE sku = ?').get(row.sku) : null;
      if (existingVariant) {
        db.prepare('UPDATE variants SET size=?, color=?, price=?, stock=?, low_stock_threshold=? WHERE id=?')
          .run(row.size, row.color, Number(row.price) || 0, Number(row.stock) || 0, Number(row.low_stock_threshold) || 3, existingVariant.id);
        updated++;
      } else {
        db.prepare(`INSERT INTO variants (id, product_id, size, color, sku, price, stock, low_stock_threshold)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(genId('var'), product.id, row.size, row.color, row.sku || genId('sku'), Number(row.price) || 0, Number(row.stock) || 0, Number(row.low_stock_threshold) || 3);
        created++;
      }
    }
    return sendJSON(res, 200, { rowsProcessed: rows.length, variantsCreated: created, variantsUpdated: updated, productsCreated }), true;
  }

  // ---- Orders ----
  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (query.status) { sql += ' AND status = ?'; params.push(query.status); }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);
    return sendJSON(res, 200, rows), true;
  }
  const orderIdMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderIdMatch && req.method === 'GET') {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderIdMatch[1]);
    if (!order) return sendJSON(res, 404, { error: 'Order not found' }), true;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC').all(order.id);
    return sendJSON(res, 200, { order, items, history }), true;
  }
  const orderStatusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch && req.method === 'PUT') {
    const { status, note } = await readJSON(req);
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderStatusMatch[1]);
    db.prepare('INSERT INTO order_status_history (id, order_id, status, note) VALUES (?, ?, ?, ?)')
      .run(genId('hist'), orderStatusMatch[1], status, note || `Marked ${status} by ${admin.name}`);
    // Simulated customer notification (SMS/WhatsApp integration point)
    console.log(`[notify] Order ${orderStatusMatch[1]} -> ${status}. (Hook up an SMS/WhatsApp provider here.)`);
    return sendJSON(res, 200, { ok: true }), true;
  }

  // ---- Returns / refunds ----
  if (pathname === '/api/admin/returns' && req.method === 'GET') {
    const rows = db.prepare(`SELECT r.*, o.order_number FROM returns r JOIN orders o ON o.id = r.order_id ORDER BY r.created_at DESC`).all();
    return sendJSON(res, 200, rows), true;
  }
  const returnIdMatch = pathname.match(/^\/api\/admin\/returns\/([^/]+)$/);
  if (returnIdMatch && req.method === 'PUT') {
    const { status } = await readJSON(req);
    db.prepare('UPDATE returns SET status = ? WHERE id = ?').run(status, returnIdMatch[1]);
    if (status === 'refunded') {
      const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnIdMatch[1]);
      db.prepare("UPDATE orders SET payment_status = 'refunded' WHERE id = ?").run(ret.order_id);
    }
    return sendJSON(res, 200, { ok: true }), true;
  }

  // ---- Analytics ----
  if (pathname === '/api/admin/analytics' && req.method === 'GET') {
    const revenueByDay = db.prepare(`SELECT substr(created_at,1,10) as day, SUM(total) as revenue, COUNT(*) as orders
        FROM orders WHERE payment_status != 'refunded' GROUP BY day ORDER BY day DESC LIMIT 14`).all();
    const bestSellers = db.prepare(`SELECT name, SUM(qty) as unitsSold, SUM(qty*price) as revenue FROM order_items
        GROUP BY name ORDER BY unitsSold DESC LIMIT 8`).all();
    const topSizes = db.prepare(`SELECT size, SUM(qty) as unitsSold FROM order_items GROUP BY size ORDER BY unitsSold DESC LIMIT 8`).all();
    const totals = db.prepare(`SELECT COUNT(*) as orderCount, COALESCE(SUM(total),0) as revenue FROM orders WHERE payment_status != 'refunded'`).get();
    const statusCounts = db.prepare(`SELECT status, COUNT(*) as c FROM orders GROUP BY status`).all();
    const lowStockCount = db.prepare('SELECT COUNT(*) c FROM variants WHERE stock <= low_stock_threshold').get().c;
    return sendJSON(res, 200, { revenueByDay: revenueByDay.reverse(), bestSellers, topSizes, totals, statusCounts, lowStockCount }), true;
  }

  // ---- CRM: customers ----
  if (pathname === '/api/admin/customers' && req.method === 'GET') {
    const rows = db.prepare(`SELECT c.id, c.name, c.email, c.phone, c.created_at,
        COUNT(o.id) as orderCount, COALESCE(SUM(o.total),0) as lifetimeSpend
        FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id ORDER BY lifetimeSpend DESC`).all();
    return sendJSON(res, 200, rows), true;
  }

  // ---- Coupons ----
  if (pathname === '/api/admin/coupons' && req.method === 'GET') {
    return sendJSON(res, 200, db.prepare('SELECT * FROM coupons').all()), true;
  }
  if (pathname === '/api/admin/coupons' && req.method === 'POST') {
    const c = await readJSON(req);
    db.prepare('INSERT OR REPLACE INTO coupons (code, type, value, min_order, active, description) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.code.toUpperCase(), c.type, Number(c.value), Number(c.minOrder) || 0, c.active === false ? 0 : 1, c.description || '');
    return sendJSON(res, 200, { ok: true }), true;
  }
  const couponMatch = pathname.match(/^\/api\/admin\/coupons\/([^/]+)$/);
  if (couponMatch && req.method === 'DELETE') {
    db.prepare('DELETE FROM coupons WHERE code = ?').run(couponMatch[1]);
    return sendJSON(res, 200, { ok: true }), true;
  }

  // ---- Banners ----
  if (pathname === '/api/admin/banners' && req.method === 'GET') {
    return sendJSON(res, 200, db.prepare('SELECT * FROM banners ORDER BY sort_order').all()), true;
  }
  if (pathname === '/api/admin/banners' && req.method === 'POST') {
    const b = await readJSON(req);
    db.prepare('INSERT INTO banners (id, title, subtitle, image, active, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(genId('ban'), b.title, b.subtitle || '', b.image || '', b.active === false ? 0 : 1, Number(b.sortOrder) || 0);
    return sendJSON(res, 200, { ok: true }), true;
  }
  const bannerMatch = pathname.match(/^\/api\/admin\/banners\/([^/]+)$/);
  if (bannerMatch && req.method === 'DELETE') {
    db.prepare('DELETE FROM banners WHERE id = ?').run(bannerMatch[1]);
    return sendJSON(res, 200, { ok: true }), true;
  }

  // ---- Staff management (owner only, already gated above) ----
  if (pathname === '/api/admin/staff' && req.method === 'GET') {
    return sendJSON(res, 200, db.prepare('SELECT id, username, role, name FROM admin_users').all()), true;
  }
  if (pathname === '/api/admin/staff' && req.method === 'POST') {
    const s = await readJSON(req);
    db.prepare('INSERT INTO admin_users (id, username, password_hash, role, name) VALUES (?, ?, ?, ?, ?)')
      .run(genId('adm'), s.username, hashPassword(s.password), s.role === 'owner' ? 'owner' : 'staff', s.name || s.username);
    return sendJSON(res, 200, { ok: true }), true;
  }

  return sendJSON(res, 404, { error: 'Unknown admin route' }), true;
}

module.exports = { handleAdminApi, getAdminFromReq };
