const STATUS_FLOW = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const STATUS_LABEL = { placed: 'Order Placed', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };

function renderOrderCard(order, items, history) {
  const isTerminalBad = order.status === 'cancelled' || order.status === 'returned';
  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const track = isTerminalBad ? '' : `
    <div class="status-track">
      ${STATUS_FLOW.map((s, i) => `
        <div class="status-step ${i <= currentIdx ? 'done' : ''}">
          <div class="dot"></div>${STATUS_LABEL[s]}
        </div>`).join('')}
    </div>`;

  return `
    <div class="notice" style="padding:22px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-family:'Fraunces',serif;font-size:18px;">Order ${order.order_number}</div>
          <div style="font-size:12.5px;color:var(--stone);">${new Date(order.created_at).toLocaleString('en-IN')}</div>
        </div>
        <span class="badge ${order.status}">${STATUS_LABEL[order.status] || order.status}</span>
      </div>
      ${track}
      <div style="margin-top:20px;">
        ${items.map((i) => `
          <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid var(--line);">
            <span>${i.name} (${i.size}/${i.color}) &times;${i.qty}</span><span>${money(i.price * i.qty)}</span>
          </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;padding:10px 0 0;">
        <span>Payment</span><span style="text-transform:capitalize;">${order.payment_method} — ${order.payment_status}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-family:'Fraunces',serif;font-size:17px;padding-top:6px;">
        <span>Total</span><span>${money(order.total)}</span>
      </div>
      <div style="font-size:12.5px;color:var(--stone);margin-top:10px;">Delivering to: ${order.address_line1}, ${order.address_city}, ${order.address_state} ${order.address_pincode}</div>
    </div>`;
}
