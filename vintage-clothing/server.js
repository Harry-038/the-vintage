// server.js — entry point. Zero external dependencies: run with `node server.js`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { handlePublicApi } = require('./api-public');
const { handleAdminApi } = require('./api-admin');
const { sendJSON } = require('./utils');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const PALETTE = {
  suits: '#2B2420', 'casual-shirts': '#8C6A46', trousers: '#3A3A38',
  outerwear: '#4A2E2A', accessories: '#6B2B2B', shoes: '#2E2A24', default: '#3A332B',
};

function placeholderSVG(name) {
  const label = decodeURIComponent(name.replace('.svg', '')).replace(/-/g, ' ');
  const color = PALETTE[name.replace('.svg', '')] || PALETTE.default;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750">
    <rect width="600" height="750" fill="${color}"/>
    <g opacity="0.15" stroke="#F1EAD9" stroke-width="1">
      <line x1="40" y1="40" x2="560" y2="40"/><line x1="40" y1="710" x2="560" y2="710"/>
      <line x1="40" y1="40" x2="40" y2="710"/><line x1="560" y1="40" x2="560" y2="710"/>
    </g>
    <text x="300" y="385" font-family="Georgia, serif" font-size="34" fill="#F1EAD9" text-anchor="middle"
      text-transform="capitalize">${label}</text>
    <text x="300" y="420" font-family="Georgia, serif" font-size="14" fill="#B8863B" text-anchor="middle">THE VINTAGE CLOTHING</text>
  </svg>`;
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-ish fallback for pretty admin/product routes handled client-side
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);
    const query = parsed.query;

    if (pathname.startsWith('/img/placeholder/')) {
      const name = pathname.replace('/img/placeholder/', '');
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      return res.end(placeholderSVG(name));
    }

    if (pathname.startsWith('/api/admin/')) {
      const handled = await handleAdminApi(req, res, pathname, query);
      if (handled) return;
    }
    if (pathname.startsWith('/api/')) {
      const handled = await handlePublicApi(req, res, pathname, query);
      if (handled) return;
      return sendJSON(res, 404, { error: 'Unknown API route' });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Server error', detail: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`\nThe Vintage Clothing — dev server running`);
  console.log(`  Storefront: http://localhost:${PORT}/`);
  console.log(`  Admin:      http://localhost:${PORT}/admin/login.html  (owner / vintage123)\n`);
});
