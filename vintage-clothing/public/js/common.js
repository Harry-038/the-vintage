// common.js — shared across every storefront page. Cart persists in localStorage (per requirements).
const CART_KEY = 'vc_cart_v1';

const Cart = {
  read() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  },
  write(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    Cart.renderCount();
  },
  add(line) {
    const items = Cart.read();
    const existing = items.find((i) => i.variantId === line.variantId);
    if (existing) existing.qty += line.qty;
    else items.push(line);
    Cart.write(items);
  },
  setQty(variantId, qty) {
    let items = Cart.read();
    items = items.map((i) => i.variantId === variantId ? { ...i, qty } : i).filter((i) => i.qty > 0);
    Cart.write(items);
  },
  remove(variantId) {
    Cart.write(Cart.read().filter((i) => i.variantId !== variantId));
  },
  clear() { Cart.write([]); },
  count() { return Cart.read().reduce((s, i) => s + i.qty, 0); },
  renderCount() {
    document.querySelectorAll('[data-cart-count]').forEach((el) => el.textContent = Cart.count());
  },
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function money(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---- Shared header/footer (injected into every storefront page via a placeholder div) ----
function mountChrome() {
  const headerMount = qs('#site-header');
  if (headerMount) {
    headerMount.outerHTML = `
    <header class="site-header">
      <div class="header-top">
        <a class="logo" href="/index.html">The Vintage Clothing<small>SANGRUR &middot; PUNJAB</small></a>
        <div class="search-box"><input id="global-search" placeholder="Search suits, shirts, trousers…" /></div>
        <button class="menu-toggle" type="button" aria-label="Toggle menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
        <div class="header-actions" id="header-actions">
          <a href="/orders.html">Track Order</a>
          <a href="/account.html">Account</a>
          <a href="/cart.html">Cart (<span data-cart-count>0</span>)</a>
        </div>
      </div>
      <nav class="nav-strip" id="nav-strip">
        <div class="container" id="nav-categories">
          <a href="/category.html?cat=suits">Suits</a>
          <a href="/category.html?cat=casual-shirts">Casual Shirts</a>
          <a href="/category.html?cat=trousers">Trousers</a>
          <a href="/category.html?cat=outerwear">Outerwear</a>
          <a href="/category.html?cat=accessories">Accessories</a>
          <a href="/category.html?cat=shoes">Shoes</a>
        </div>
      </nav>
    </header>`;

    const searchInput = qs('#global-search');
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        location.href = '/category.html?q=' + encodeURIComponent(searchInput.value.trim());
      }
    });

    const menuToggle = qs('.menu-toggle');
    const mobileNav = qs('#nav-strip');
    const headerActions = qs('#header-actions');
    if (menuToggle && mobileNav && headerActions) {
      menuToggle.addEventListener('click', () => {
        const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', String(!isOpen));
        mobileNav.classList.toggle('open', !isOpen);
        headerActions.classList.toggle('open', !isOpen);
      });
    }
  }
  const footerMount = qs('#site-footer');
  if (footerMount) {
    footerMount.outerHTML = `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <h5>The Vintage Clothing</h5>
          <p>Tailored menswear — suits, shirts, trousers, outerwear, accessories &amp; shoes.<br>Sangrur, Punjab, India.</p>
        </div>
        <div>
          <h5>Shop</h5>
          <a href="/category.html?cat=suits">Suits</a>
          <a href="/category.html?cat=casual-shirts">Casual Shirts</a>
          <a href="/category.html?cat=shoes">Shoes</a>
        </div>
        <div>
          <h5>Help</h5>
          <a href="/orders.html">Track an order</a>
          <a href="/orders.html#returns">Returns &amp; exchanges</a>
          <a href="/size-guide.html">Size guide</a>
        </div>
        <div>
          <h5>Account</h5>
          <a href="/account.html">Sign in / Register</a>
          <a href="/admin/login.html">Shop owner login</a>
        </div>
      </div>
      <div class="container footer-bottom">Prototype build — payments are simulated. &copy; The Vintage Clothing, Sangrur.</div>
    </footer>`;
  }
  Cart.renderCount();
}
document.addEventListener('DOMContentLoaded', mountChrome);
