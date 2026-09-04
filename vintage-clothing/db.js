// db.js — SQLite layer using Node's built-in node:sqlite (no npm install needed)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'store.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}
function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
function genOrderNumber() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `VC-${n}`;
}

function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
    category_id TEXT REFERENCES categories(id),
    description TEXT, fit TEXT, occasion TEXT,
    base_price REAL NOT NULL, images TEXT DEFAULT '[]',
    active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY, product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
    size TEXT NOT NULL, color TEXT NOT NULL, sku TEXT UNIQUE NOT NULL,
    price REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, low_stock_threshold INTEGER DEFAULT 3
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT,
    password_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
    label TEXT, line1 TEXT, city TEXT, state TEXT, pincode TEXT, phone TEXT, is_default INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY, type TEXT NOT NULL, value REAL NOT NULL,
    min_order REAL DEFAULT 0, active INTEGER DEFAULT 1, description TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, order_number TEXT UNIQUE NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    guest_name TEXT, guest_phone TEXT, guest_email TEXT,
    address_line1 TEXT, address_city TEXT, address_state TEXT, address_pincode TEXT,
    payment_method TEXT, payment_status TEXT DEFAULT 'pending',
    status TEXT DEFAULT 'placed',
    subtotal REAL, discount REAL DEFAULT 0, total REAL,
    coupon_code TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT, variant_id TEXT, name TEXT, size TEXT, color TEXT, sku TEXT,
    price REAL, qty INTEGER
  );
  CREATE TABLE IF NOT EXISTS order_status_history (
    id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id TEXT, type TEXT, reason TEXT, status TEXT DEFAULT 'requested',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, role TEXT DEFAULT 'staff', name TEXT
  );
  CREATE TABLE IF NOT EXISTS banners (
    id TEXT PRIMARY KEY, title TEXT, subtitle TEXT, image TEXT, active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, admin_id TEXT, customer_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  `);
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (count > 0) return; // already seeded

  const categories = [
    ['Suits', 'suits'], ['Casual Shirts', 'casual-shirts'], ['Trousers', 'trousers'],
    ['Outerwear', 'outerwear'], ['Accessories', 'accessories'], ['Shoes', 'shoes'],
  ];
  const catIns = db.prepare('INSERT INTO categories (id, name, slug, sort_order) VALUES (?, ?, ?, ?)');
  const catIds = {};
  categories.forEach(([name, slug], i) => {
    const id = genId('cat');
    catIds[slug] = id;
    catIns.run(id, name, slug, i);
  });

  const prodIns = db.prepare(`INSERT INTO products (id, name, slug, category_id, description, fit, occasion, base_price, images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const varIns = db.prepare(`INSERT INTO variants (id, product_id, size, color, sku, price, stock, low_stock_threshold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const products = [
    { name: 'Heritage Navy Two-Piece Suit', cat: 'suits', fit: 'Tailored', occasion: 'Formal', price: 8999,
      desc: 'A hand-finished navy suit cut from mid-weight wool blend, built for weddings, sherwani-optional functions, and the boardroom alike.',
      sizes: ['38R', '40R', '42R', '44R'], colors: ['Navy', 'Charcoal'] },
    { name: 'Classic Grey Check Blazer', cat: 'suits', fit: 'Slim', occasion: 'Formal', price: 5499,
      desc: 'Windowpane check blazer with a slim silhouette — pairs equally well with trousers or denim.',
      sizes: ['38R', '40R', '42R'], colors: ['Grey'] },
    { name: 'Oxford Weave Casual Shirt', cat: 'casual-shirts', fit: 'Regular', occasion: 'Casual', price: 1299,
      desc: 'Breathable oxford-weave cotton shirt for everyday wear, from Sangrur to the city.',
      sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['White', 'Sky Blue', 'Olive'] },
    { name: 'Linen Blend Summer Shirt', cat: 'casual-shirts', fit: 'Regular', occasion: 'Casual', price: 1499,
      desc: 'Lightweight linen-cotton blend that breathes through Punjab summers.',
      sizes: ['S', 'M', 'L', 'XL'], colors: ['Beige', 'White'] },
    { name: 'Tailored Formal Trousers', cat: 'trousers', fit: 'Tailored', occasion: 'Formal', price: 1799,
      desc: 'Flat-front tailored trousers with a clean break, finished with a half-canvas waistband.',
      sizes: ['30', '32', '34', '36', '38'], colors: ['Black', 'Navy', 'Grey'] },
    { name: 'Relaxed Chino Trousers', cat: 'trousers', fit: 'Regular', occasion: 'Casual', price: 1599,
      desc: 'Everyday chinos with a relaxed seat and a bit of stretch.',
      sizes: ['30', '32', '34', '36'], colors: ['Khaki', 'Navy', 'Stone'] },
    { name: 'Wool Blend Overcoat', cat: 'outerwear', fit: 'Regular', occasion: 'Formal', price: 6499,
      desc: 'A knee-length wool blend overcoat for winter formals and the odd cold Sangrur evening.',
      sizes: ['M', 'L', 'XL'], colors: ['Camel', 'Charcoal'] },
    { name: 'Quilted Bomber Jacket', cat: 'outerwear', fit: 'Slim', occasion: 'Casual', price: 3299,
      desc: 'Quilted bomber with a ribbed hem, built for cool evenings out.',
      sizes: ['S', 'M', 'L', 'XL'], colors: ['Black', 'Olive'] },
    { name: 'Genuine Leather Belt', cat: 'accessories', fit: 'Regular', occasion: 'Formal', price: 899,
      desc: 'Full-grain leather belt with a brushed brass buckle.',
      sizes: ['32', '34', '36', '38'], colors: ['Black', 'Brown'] },
    { name: 'Silk Blend Neck Tie', cat: 'accessories', fit: 'Regular', occasion: 'Formal', price: 599,
      desc: 'A subtly textured silk-blend tie for suits and sherwanis.',
      sizes: ['One Size'], colors: ['Maroon', 'Navy', 'Charcoal'] },
    { name: 'Formal Oxford Shoes', cat: 'shoes', fit: 'Regular', occasion: 'Formal', price: 2999,
      desc: 'Classic cap-toe oxfords in polished leather.',
      sizes: ['7', '8', '9', '10', '11'], colors: ['Black', 'Brown'] },
    { name: 'Casual Leather Sneakers', cat: 'shoes', fit: 'Regular', occasion: 'Casual', price: 2499,
      desc: 'Minimal leather sneakers that go from daywear to dinner.',
      sizes: ['7', '8', '9', '10', '11'], colors: ['White', 'Tan'] },
  ];

  let skuCounter = 1000;
  products.forEach((p) => {
    const id = genId('prod');
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    prodIns.run(id, p.name, slug, catIds[p.cat], p.desc, p.fit, p.occasion, p.price, JSON.stringify([`/img/placeholder/${p.cat}.svg`]));
    p.sizes.forEach((size) => {
      p.colors.forEach((color) => {
        skuCounter++;
        const sku = `VC-${skuCounter}`;
        const stock = Math.floor(Math.random() * 12); // some will be low/out of stock on purpose
        varIns.run(genId('var'), id, size, color, sku, p.price, stock, 3);
      });
    });
  });

  db.prepare('INSERT INTO coupons (code, type, value, min_order, active, description) VALUES (?, ?, ?, ?, 1, ?)')
    .run('WELCOME10', 'percent', 10, 0, '10% off your first order');
  db.prepare('INSERT INTO coupons (code, type, value, min_order, active, description) VALUES (?, ?, ?, ?, 1, ?)')
    .run('FLAT200', 'flat', 200, 1999, 'Flat ₹200 off orders above ₹1999');

  db.prepare('INSERT INTO admin_users (id, username, password_hash, role, name) VALUES (?, ?, ?, ?, ?)')
    .run(genId('adm'), 'owner', hashPassword('vintage123'), 'owner', 'Shop Owner');
  db.prepare('INSERT INTO admin_users (id, username, password_hash, role, name) VALUES (?, ?, ?, ?, ?)')
    .run(genId('adm'), 'packing', hashPassword('packing123'), 'staff', 'Packing Staff');

  db.prepare('INSERT INTO banners (id, title, subtitle, image, active, sort_order) VALUES (?, ?, ?, ?, 1, 0)')
    .run(genId('ban'), 'The Vintage Clothing', 'Tailored menswear from Sangrur, Punjab — suits, shirts & more', '/img/placeholder/outerwear.svg');

  console.log('Seeded database with sample catalog, coupons and admin logins.');
  console.log('  Owner login:   owner / vintage123');
  console.log('  Staff login:   packing / packing123');
}

migrate();
seed();

module.exports = { db, hashPassword, verifyPassword, genId, genOrderNumber };
