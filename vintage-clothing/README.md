# The Vintage Clothing — Storefront + Admin Prototype

A working prototype for a menswear e-commerce store (Sangrur, Punjab): a buyer-facing
storefront plus a shop-owner admin dashboard, covering the feature list you sent —
browsing/filtering, cart, checkout, order tracking, returns, plus catalog management,
order/fulfillment ops, and basic BI/marketing tools.

## Why this stack

**Zero npm dependencies, on purpose.** The server is plain Node.js using the built-in
`node:sqlite` module (stable enough in Node 22+ for a prototype), and the frontend is
vanilla HTML/CSS/JS with no build step. That means:

- No `npm install`, no bundler, no framework version drift.
- One process (`node server.js`) runs the whole thing.
- It's trivial to read top-to-bottom — every route is in `api-public.js` or
  `api-admin.js`, no framework magic.

The tradeoff: this is a **prototype**, not a production-hardened platform. See
"What to harden before real deployment" below.

## Requirements

- Node.js **22.5+** (for `node:sqlite`). Check with `node -v`.
- Nothing else. No database server, no Redis, no build tools.

## Running it

```bash
cd vintage-clothing
node server.js
```

Then open:
- **Storefront:** http://localhost:3000/
- **Admin dashboard:** http://localhost:3000/admin/login.html

Demo admin logins (seeded automatically on first run):
- **Owner** (full access): `owner` / `vintage123`
- **Staff** (Orders & Shipping only — e.g. "Packing Staff"): `packing` / `packing123`

The database is a single file at `data/store.db`, created and seeded with sample
categories, products, variants, and coupons the first time you run the server. **Delete
`data/store.db` and restart to reset to a fresh seeded state.**

To run on a different port: `PORT=8080 node server.js`.

## Project structure

```
server.js           HTTP server: routing, static files, on-the-fly placeholder images
db.js                SQLite schema + seed data (products, variants, coupons, admin logins)
api-public.js        Buyer-facing API: catalog, cart/checkout, tracking, accounts
api-admin.js         Admin API: products/variants, orders, returns, analytics, CSV, coupons
utils.js             Small shared HTTP helpers (JSON, cookies, sessions)
public/              Storefront: index.html, category.html, product.html, cart.html,
                      checkout.html, orders.html (tracking+returns), account.html, ...
public/admin/        Admin dashboard: login.html + a single index.html "app shell" with
                      hash-based sections (dashboard/products/orders/returns/customers/
                      marketing/import/staff), plus packing-slip.html for printing
```

## What's real vs. simulated in this prototype

| Feature | Status |
|---|---|
| Catalog, variants, filtering, search | Real — backed by SQLite |
| Cart | Real — persists in `localStorage` |
| Checkout, stock decrement, order creation | Real — server validates stock & price |
| Coupons (percent/flat, min order) | Real |
| Order tracking, status history | Real |
| Returns/exchange requests + admin approval/refund flow | Real |
| Guest + registered checkout, saved addresses | Real |
| Admin: products/variants CRUD, low-stock alerts | Real |
| Admin: order status workflow, printable packing slip | Real |
| Admin: CSV bulk import/export | Real |
| Admin: analytics (revenue, best sellers, top sizes) | Real, computed from your actual orders |
| Admin: role-based access (Owner vs. Staff) | Real — staff logins are 403'd out of Products/CRM/etc. |
| **Payments** (Card/UPI/Net Banking/Wallet) | **Simulated.** COD is a real status; other methods are marked "paid" immediately with no gateway involved. |
| **SMS/WhatsApp notifications** | **Simulated** — logged to the server console with a comment showing where to hook in a provider. |
| **Shipping/courier integration** | **Simulated** — packing slip has a blank line for courier assignment; no real courier API call. |
| Product photography | Placeholder SVGs generated on the fly per category. |

## What I'd extend first

1. **Real payments.** Wire up Razorpay (most common for COD+UPI+cards in India) or
   Stripe at the `paymentMethod !== 'cod'` branch in `api-public.js`'s `/api/checkout`
   handler — create an order, redirect to the gateway's checkout, verify the webhook,
   then mark `payment_status = 'paid'`.
2. **Real product photography + image zoom/360°.** Right now `images` is just a JSON
   array of URLs on each product; swap the placeholder generator for actual uploaded
   photos (S3/Cloudinary) and add a lightweight zoom/carousel on the product page.
3. **SMS/WhatsApp on status change.** The exact hook point is marked with a
   `console.log('[notify] ...')` in `api-admin.js`'s order-status route — swap that for
   Twilio/Gupshup/an official WhatsApp Business API call.
4. **Move off `node:sqlite` before scaling.** It's genuinely fine for a single-shop
   prototype, but it's still an experimental Node API and SQLite is single-writer. If
   you outgrow one shop or want multiple concurrent staff hammering the admin at once,
   migrate to Postgres — the SQL in `db.js`/`api-*.js` is plain enough to port directly.
5. **Proper password/session hardening.** Sessions here are just a random token in a
   cookie with no expiry sweep; add expiry + rotation, and consider rate-limiting the
   login routes before this is public.
6. **Bundle/promo rules engine.** Coupons are simple flat/percent right now. "Buy 2
   shirts, get 10%" is mentioned as copy on the cart page but not yet enforced — extend
   the checkout discount logic in `api-public.js` to detect qualifying combinations.
7. **Deployment.** Since it's a single Node process with a file-based DB, it'll run
   as-is on any VPS (Railway, Render, a DigitalOcean droplet, even a cheap shared host
   with Node support) — just make sure the host's Node version is 22.5+, run it behind
   a reverse proxy (nginx/Caddy) for TLS, and back up `data/store.db` regularly.

## Notes on the design

The storefront leans into the tailoring/pattern-paper idea — hairline rules instead of
card shadows, a brass accent, serif display type — since it's a menswear shop, not a
generic SaaS template. The admin dashboard is deliberately plainer and denser: it's a
tool for daily operations, not a marketing surface.
