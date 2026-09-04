let appliedCoupon = null;

function renderCartPage() {
  const items = Cart.read();
  if (!items.length) {
    qs('#cart-layout').innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <p style="font-size:18px;margin-bottom:16px;">Your cart is empty.</p>
      <a href="/category.html" class="btn btn-brass">Start browsing</a>
    </div>`;
    return;
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  qs('#cart-layout').innerHTML = `
    <div>
      ${items.map((i) => `
        <div class="cart-line" data-id="${i.variantId}">
          <img src="${i.image}" alt="${i.name}" />
          <div>
            <div class="name">${i.name}</div>
            <div class="meta">Size ${i.size} &middot; ${i.color} &middot; ${money(i.price)} each</div>
            <div class="qty-control" style="width:fit-content;">
              <button class="q-minus">−</button><span>${i.qty}</span><button class="q-plus">+</button>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Fraunces',serif;">${money(i.price * i.qty)}</div>
            <button class="remove">Remove</button>
          </div>
        </div>`).join('')}
    </div>
    <div class="summary-card">
      <h3 style="margin-bottom:16px;">Order summary</h3>
      <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="summary-row" id="discount-row" style="display:none;"><span>Discount</span><span id="discount-val"></span></div>
      <div class="coupon-row">
        <input id="coupon-input" placeholder="Promo code (try WELCOME10)" />
        <button class="btn btn-outline btn-sm" id="apply-coupon">Apply</button>
      </div>
      <div id="coupon-msg" class="coupon-msg"></div>
      <div class="summary-row total"><span>Total</span><span id="total-val">${money(subtotal)}</span></div>
      <a href="/checkout.html" class="btn btn-brass btn-block" style="margin-top:14px;">Proceed to checkout</a>
      <p style="font-size:12px;color:var(--stone);margin-top:12px;">Buy 2 casual shirts and mention code SHIRT10 at checkout for 10% off — bundle offers are configurable from the admin coupon panel.</p>
    </div>
  `;

  qsa('.cart-line').forEach((line) => {
    const id = line.dataset.id;
    qs('.q-plus', line).addEventListener('click', () => {
      const item = items.find((i) => i.variantId === id);
      Cart.setQty(id, item.qty + 1); renderCartPage();
    });
    qs('.q-minus', line).addEventListener('click', () => {
      const item = items.find((i) => i.variantId === id);
      Cart.setQty(id, item.qty - 1); renderCartPage();
    });
    qs('.remove', line).addEventListener('click', () => { Cart.remove(id); renderCartPage(); });
  });

  qs('#apply-coupon').addEventListener('click', async () => {
    const code = qs('#coupon-input').value.trim();
    if (!code) return;
    try {
      const result = await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal } });
      appliedCoupon = result;
      sessionStorage.setItem('vc_coupon', JSON.stringify(result));
      qs('#coupon-msg').className = 'coupon-msg ok';
      qs('#coupon-msg').textContent = `Applied ${result.code} — ${result.description}`;
      qs('#discount-row').style.display = 'flex';
      qs('#discount-val').textContent = '−' + money(result.discount);
      qs('#total-val').textContent = money(Math.max(0, subtotal - result.discount));
    } catch (e) {
      appliedCoupon = null;
      sessionStorage.removeItem('vc_coupon');
      qs('#coupon-msg').className = 'coupon-msg err';
      qs('#coupon-msg').textContent = e.message;
    }
  });
}

renderCartPage();
