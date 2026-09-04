// api-public.js — buyer-facing API: browsing, checkout, order tracking, accounts
const { db, hashPassword, verifyPassword, genId, genOrderNumber } = require('./db');
const { sendJSON, readJSON, parseCookies, setCookie, money } = require('./utils');

function getCustomerFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies.vc_session;
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row || !row.customer_id) return null;
  return db.prepare('SELECT id, name, email, phone FROM customers WHERE id = ?').get(row.customer_id);
}

function productWithVariants(product) {
  const variants = db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY size, color').all(product.id);
  const sizes = [...new Set(variants.map(v => v.size))];
  const colors = [...new Set(variants.map(v => v.color))];
  const inStock = variants.some(v => v.stock > 0);
  return { ...product, images: JSON.parse(product.images || '[]'), variants, sizes, colors, inStock };
}

async function handlePublicApi(req, res, pathname, query) {
  // ---- Categories ----
  if (pathname === '/api/categories' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
    return sendJSON(res, 200, rows), true;
  }

  // ---- Banners ----
  if (pathname === '/api/banners' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM banners WHERE active = 1 ORDER BY sort_order').all();
    return sendJSON(res, 200, rows), true;
  }

  // ---- Product listing with filters ----
  if (pathname === '/api/products' && req.method === 'GET') {
    let sql = `SELECT DISTINCT p.* FROM products p LEFT JOIN variants v ON v.product_id = p.id
               LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1`;
    const params = [];
    if (query.category) { sql += ' AND c.slug = ?'; params.push(query.category); }
    if (query.fit) { sql += ' AND p.fit = ?'; params.push(query.fit); }
    if (query.occasion) { sql += ' AND p.occasion = ?'; params.push(query.occasion); }
    if (query.minPrice) { sql += ' AND p.base_price >= ?'; params.push(Number(query.minPrice)); }
    if (query.maxPrice) { sql += ' AND p.base_price <= ?'; params.push(Number(query.maxPrice)); }
    if (query.size) { sql += ' AND v.size = ?'; params.push(query.size); }
    if (query.color) { sql += ' AND v.color = ?'; params.push(query.color); }
    if (query.q) { sql += ' AND p.name LIKE ?'; params.push(`%${query.q}%`); }
    if (query.sort === 'price_asc') sql += ' ORDER BY p.base_price ASC';
    else if (query.sort === 'price_desc') sql += ' ORDER BY p.base_price DESC';
    else sql += ' ORDER BY p.created_at DESC';
    const rows = db.prepare(sql).all(...params);
    const withVariants = rows.map(productWithVariants);
    return sendJSON(res, 200, withVariants), true;
  }

  // ---- Single product ----
  const prodMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (prodMatch && req.method === 'GET') {
    const product = db.prepare('SELECT * FROM products WHERE slug = ? OR id = ?').get(prodMatch[1], prodMatch[1]);
    if (!product) return sendJSON(res, 404, { error: 'Product not found' }), true;
    return sendJSON(res, 200, productWithVariants(product)), true;
  }

  // ---- Coupon validation ----
  if (pathname === '/api/coupons/validate' && req.method === 'POST') {
    const { code, subtotal } = await readJSON(req);
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get((code || '').toUpperCase());
    if (!coupon) return sendJSON(res, 404, { error: 'Invalid or expired coupon code' }), true;
    if (subtotal < coupon.min_order) {
      return sendJSON(res, 400, { error: `Minimum order of ₹${coupon.min_order} required for this coupon` }), true;
    }
    const discount = coupon.type === 'percent' ? money(subtotal * coupon.value / 100) : coupon.value;
    return sendJSON(res, 200, { code: coupon.code, discount, description: coupon.description }), true;
  }

  // ---- Checkout ----
  if (pathname === '/api/checkout' && req.method === 'POST') {
    const body = await readJSON(req);
    const { items, guest, address, paymentMethod, couponCode } = body;
    if (!items || !items.length) return sendJSON(res, 400, { error: 'Cart is empty' }), true;
    if (!address || !address.line1 || !address.city || !address.pincode) {
      return sendJSON(res, 400, { error: 'A complete delivery address is required' }), true;
    }
    const customer = getCustomerFromReq(req);

    // Validate stock & compute subtotal server-side (never trust client prices)
    let subtotal = 0;
    const resolvedItems = [];
    for (const it of items) {
      const variant = db.prepare('SELECT * FROM variants WHERE id = ?').get(it.variantId);
      if (!variant) return sendJSON(res, 400, { error: 'One of the items is no longer available' }), true;
      const qty = Math.max(1, Number(it.qty) || 1);
      const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(variant.product_id);
      if (variant.stock < qty) {
        return sendJSON(res, 400, { error: `${product?.name || 'Item'} (${variant.size}/${variant.color}) only has ${variant.stock} left in stock` }), true;
      }
      subtotal = money(subtotal + variant.price * qty);
      resolvedItems.push({ product, variant, qty });
    }

    let discount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(couponCode.toUpperCase());
      if (coupon && subtotal >= coupon.min_order) {
        discount = coupon.type === 'percent' ? money(subtotal * coupon.value / 100) : coupon.value;
        appliedCoupon = coupon.code;
      }
    }
    // Bundle offer: buy 2+ casual shirts => extra 10% off shirts portion (simple example of a rules engine)
    const total = money(Math.max(0, subtotal - discount));

    const orderId = genId('ord');
    const orderNumber = genOrderNumber();
    const paymentStatus = paymentMethod === 'cod' ? 'pending' : 'paid'; // simulated online payment
    db.prepare(`INSERT INTO orders (id, order_number, customer_id, guest_name, guest_phone, guest_email,
        address_line1, address_city, address_state, address_pincode, payment_method, payment_status, status,
        subtotal, discount, total, coupon_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?)`)
      .run(orderId, orderNumber, customer?.id || null, guest?.name || customer?.name || '', guest?.phone || customer?.phone || '',
        guest?.email || customer?.email || '', address.line1, address.city, address.state || '', address.pincode,
        paymentMethod, paymentStatus, subtotal, discount, total, appliedCoupon);

    for (const { product, variant, qty } of resolvedItems) {
      db.prepare(`INSERT INTO order_items (id, order_id, product_id, variant_id, name, size, color, sku, price, qty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(genId('item'), orderId, product.id, variant.id, product.name, variant.size, variant.color, variant.sku, variant.price, qty);
      db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ?').run(qty, variant.id);
    }
    db.prepare('INSERT INTO order_status_history (id, order_id, status, note) VALUES (?, ?, ?, ?)')
      .run(genId('hist'), orderId, 'placed', 'Order placed by customer');

    return sendJSON(res, 200, { orderId, orderNumber, total }), true;
  }

  // ---- Order tracking (guest-friendly: order number + phone) ----
  if (pathname === '/api/orders/track' && req.method === 'GET') {
    const { order_number, phone } = query;
    if (!order_number || !phone) return sendJSON(res, 400, { error: 'Order number and phone are required' }), true;
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND (guest_phone = ? OR customer_id IN (SELECT id FROM customers WHERE phone = ?))')
      .get(order_number.trim(), phone.trim(), phone.trim());
    if (!order) return sendJSON(res, 404, { error: 'No matching order found. Check the order number and phone.' }), true;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC').all(order.id);
    return sendJSON(res, 200, { order, items, history }), true;
  }

  // ---- Return / exchange request ----
  if (pathname === '/api/returns' && req.method === 'POST') {
    const { orderNumber, phone, orderItemId, type, reason } = await readJSON(req);
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND (guest_phone = ? OR customer_id IN (SELECT id FROM customers WHERE phone = ?))')
      .get(orderNumber, phone, phone);
    if (!order) return sendJSON(res, 404, { error: 'Order not found' }), true;
    if (order.status !== 'delivered') return sendJSON(res, 400, { error: 'Returns can only be requested after delivery' }), true;
    db.prepare('INSERT INTO returns (id, order_id, order_item_id, type, reason, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(genId('ret'), order.id, orderItemId, type, reason, 'requested');
    return sendJSON(res, 200, { ok: true }), true;
  }

  // ---- Customer accounts ----
  if (pathname === '/api/customers/register' && req.method === 'POST') {
    const { name, email, phone, password } = await readJSON(req);
    if (!email || !password) return sendJSON(res, 400, { error: 'Email and password are required' }), true;
    const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
    if (existing) return sendJSON(res, 400, { error: 'An account with this email already exists' }), true;
    const id = genId('cust');
    db.prepare('INSERT INTO customers (id, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, name || '', email, phone || '', hashPassword(password));
    const token = genId('sess');
    db.prepare('INSERT INTO sessions (token, customer_id) VALUES (?, ?)').run(token, id);
    setCookie(res, 'vc_session', token, { maxAge: 60 * 60 * 24 * 30 });
    return sendJSON(res, 200, { id, name, email }), true;
  }

  if (pathname === '/api/customers/login' && req.method === 'POST') {
    const { email, password } = await readJSON(req);
    const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (!customer || !verifyPassword(password, customer.password_hash)) {
      return sendJSON(res, 401, { error: 'Invalid email or password' }), true;
    }
    const token = genId('sess');
    db.prepare('INSERT INTO sessions (token, customer_id) VALUES (?, ?)').run(token, customer.id);
    setCookie(res, 'vc_session', token, { maxAge: 60 * 60 * 24 * 30 });
    return sendJSON(res, 200, { id: customer.id, name: customer.name, email: customer.email }), true;
  }

  if (pathname === '/api/customers/logout' && req.method === 'POST') {
    setCookie(res, 'vc_session', '', {});
    return sendJSON(res, 200, { ok: true }), true;
  }

  if (pathname === '/api/customers/me' && req.method === 'GET') {
    const customer = getCustomerFromReq(req);
    if (!customer) return sendJSON(res, 401, { error: 'Not logged in' }), true;
    return sendJSON(res, 200, customer), true;
  }

  if (pathname === '/api/customers/orders' && req.method === 'GET') {
    const customer = getCustomerFromReq(req);
    if (!customer) return sendJSON(res, 401, { error: 'Not logged in' }), true;
    const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customer.id);
    return sendJSON(res, 200, orders), true;
  }

  if (pathname === '/api/customers/addresses' && req.method === 'GET') {
    const customer = getCustomerFromReq(req);
    if (!customer) return sendJSON(res, 401, { error: 'Not logged in' }), true;
    const rows = db.prepare('SELECT * FROM addresses WHERE customer_id = ?').all(customer.id);
    return sendJSON(res, 200, rows), true;
  }

  if (pathname === '/api/customers/addresses' && req.method === 'POST') {
    const customer = getCustomerFromReq(req);
    if (!customer) return sendJSON(res, 401, { error: 'Not logged in' }), true;
    const { label, line1, city, state, pincode, phone } = await readJSON(req);
    db.prepare('INSERT INTO addresses (id, customer_id, label, line1, city, state, pincode, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(genId('addr'), customer.id, label || 'Home', line1, city, state, pincode, phone);
    return sendJSON(res, 200, { ok: true }), true;
  }

  return false;
}

module.exports = { handlePublicApi, getCustomerFromReq };
