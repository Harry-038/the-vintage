let payMethod = 'cod';

async function renderCheckout() {
  const items = Cart.read();
  if (!items.length) {
    qs('#checkout-layout').innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Your cart is empty. <a href="/category.html" style="text-decoration:underline;">Go shopping</a>.</div>`;
    return;
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const coupon = JSON.parse(sessionStorage.getItem('vc_coupon') || 'null');
  const discount = coupon ? coupon.discount : 0;
  const total = Math.max(0, subtotal - discount);

  let customer = null;
  try { customer = await api('/api/customers/me'); } catch {}

  qs('#checkout-layout').innerHTML = `
    <div>
      ${customer ? `<div class="notice ok">Checking out as <strong>${customer.name || customer.email}</strong>.</div>` : ''}
      <form id="checkout-form">
        <div class="field full"><label>Full name</label><input name="name" required value="${customer?.name || ''}" /></div>
        <div class="form-grid">
          <div class="field"><label>Phone</label><input name="phone" required value="${customer?.phone || ''}" /></div>
          <div class="field"><label>Email (optional)</label><input name="email" type="email" value="${customer?.email || ''}" /></div>
        </div>
        <div class="field full"><label>Address line</label><input name="line1" required placeholder="House no., street, area" /></div>
        <div class="form-grid">
          <div class="field"><label>City</label><input name="city" required placeholder="Sangrur" /></div>
          <div class="field"><label>State</label><input name="state" value="Punjab" /></div>
          <div class="field"><label>Pincode</label><input name="pincode" required placeholder="148001" /></div>
        </div>

        <div class="option-row">
          <label class="title">Payment method</label>
          <div class="pay-options" id="pay-options">
            ${[['cod', 'Cash on Delivery'], ['card', 'Credit / Debit Card'], ['upi', 'UPI'], ['netbanking', 'Net Banking'], ['wallet', 'Digital Wallet']]
              .map(([v, label]) => `<label class="pay-option ${v === 'cod' ? 'selected' : ''}"><input type="radio" name="pay" value="${v}" ${v === 'cod' ? 'checked' : ''}/> ${label}</label>`).join('')}
          </div>
          <p style="font-size:12px;color:var(--stone);margin-top:8px;">Card / UPI / Net Banking / Wallet are simulated in this prototype — wire up Razorpay or Stripe here for production.</p>
        </div>

        <div id="checkout-error"></div>
        <button class="btn btn-brass btn-block" type="submit">Place order — ${money(total)}</button>
      </form>
    </div>
    <div class="summary-card">
      <h3 style="margin-bottom:16px;">Order summary</h3>
      ${items.map((i) => `<div class="summary-row"><span>${i.name} (${i.size}/${i.color}) &times;${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      ${coupon ? `<div class="summary-row"><span>Discount (${coupon.code})</span><span>−${money(discount)}</span></div>` : ''}
      <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
    </div>
  `;

  qsa('.pay-option').forEach((opt) => opt.addEventListener('click', () => {
    qsa('.pay-option').forEach((o) => o.classList.remove('selected'));
    opt.classList.add('selected');
    payMethod = qs('input', opt).value;
  }));

  qs('#checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Placing order…';
    try {
      const result = await api('/api/checkout', {
        method: 'POST',
        body: {
          items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
          guest: { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email') },
          address: { line1: fd.get('line1'), city: fd.get('city'), state: fd.get('state'), pincode: fd.get('pincode') },
          paymentMethod: payMethod,
          couponCode: coupon?.code,
        },
      });
      Cart.clear();
      sessionStorage.removeItem('vc_coupon');
      location.href = `/order-confirmation.html?order=${result.orderNumber}&phone=${encodeURIComponent(fd.get('phone'))}`;
    } catch (err) {
      qs('#checkout-error').innerHTML = `<div class="notice err">${err.message}</div>`;
      btn.disabled = false; btn.textContent = `Place order — ${money(total)}`;
    }
  });
}

renderCheckout();
