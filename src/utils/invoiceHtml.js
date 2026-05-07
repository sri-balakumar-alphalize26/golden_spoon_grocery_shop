// Shared invoice/receipt HTML generator.
//
// Used by:
//   - src/screens/Home/Sections/Customer/CreateInvoicePreview.js (post-payment receipt)
//   - src/screens/MyOrders/OrderDetailScreen.js (re-export from order details)
//
// Producing the same output from both screens keeps the cashier's printed
// receipt identical regardless of whether they hit Print right after paying
// or come back later through the orders list.
//
// The HTML targets an 80mm thermal-receipt layout (bilingual, RTL, dotted
// separators) — DO NOT restructure without verifying it still prints
// correctly on the shop's existing receipt printer setup.

export const escapeHtml = (unsafe) => {
  return String(unsafe).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
  });
};

// Pull the trailing integer ref out of the Odoo `pos.order.name` field
// (e.g. "Clothes Shop - 000004" → "000004"). When the name isn't supplied
// — for example, immediately after creating an order before validation —
// fall back to zero-padding the database id so the receipt always has
// a number printed somewhere. We DON'T want the cumulative database id
// to leak into the printed receipt: Odoo shows users the per-register
// sequence, and the receipt should match.
export const extractOrderRef = (orderName, orderId) => {
  if (orderName) {
    const m = String(orderName).match(/(\d+)\s*$/);
    if (m) return m[1];
  }
  return String(orderId || '').padStart(6, '0');
};

export const generateInvoiceHtml = ({
  items = [],
  subtotal = 0,
  tax = 0,
  service = 0,
  total = 0,
  discount = 0,
  orderId = '',
  orderName = '',
  paidAmount = 0,
  customer = null,
  payments = [],
} = {}) => {
  const orderRef = extractOrderRef(orderName, orderId);
  const formatCurrencyHtml = (amount) => {
    const num = Number(amount);
    if (isNaN(num)) return '0';
    return parseFloat(num.toPrecision(12)).toString();
  };

  const rows = items.map((item, idx) => {
    const itemQty = item.qty || item.quantity || 1;
    const itemPrice = item.price || item.unit || item.price_unit || 0;
    const discountPercent = Number(item.discount_percent || item.discount || 0);
    const grossTotal = itemPrice * itemQty;
    const itemDiscount = item.discount_amount || (grossTotal * discountPercent / 100);
    const itemTotal = item.subtotal ?? (grossTotal - itemDiscount);
    const nameEsc = escapeHtml(item.name || 'Product');
    return `<tr>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${formatCurrencyHtml(itemTotal)}</span></td>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${itemDiscount > 0 ? '-' + formatCurrencyHtml(itemDiscount) : '0'}</span></td>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${formatCurrencyHtml(itemPrice)}</span></td>
      <td style="padding:6px 4px; text-align:center; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${itemQty}</span></td>
      <td style="padding:6px 4px; vertical-align:top;">${nameEsc}<div style="font-size:10px; color:#333; margin-top:4px;">KG</div></td>
      <td style="padding:6px 4px; vertical-align:top;">${idx + 1}.</td>
    </tr>
    <tr><td colspan="6" style="border-bottom:1px dotted #000; height:6px;">&nbsp;</td></tr>`;
  }).join('');

  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Invoice</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      html,body { margin:0; padding:0; }
      .receipt { width:72mm; margin:0 auto; box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; color:#111; direction: rtl; }
      .header { text-align:center; font-size:11px; }
      .header .company { font-weight:700; font-size:13px; }
      .hr { border-top:1px solid #999; margin:10px 0; }
      .titleBox { border-top:2px solid #000; border-bottom:2px solid #000; padding:6px 0; margin:8px 0; text-align:center; font-weight:700; }
      .meta { font-size:11px; margin-bottom:6px; }
      table { width:100%; border-collapse:collapse; font-size:11px; }
      th { font-weight:700; font-size:11px; padding:6px 4px; text-align:center; border-bottom:1px solid #000; }
      td { font-size:11px; padding:6px 4px; }
      .numCol { width:5%; }
      .prodCol { width:40%; }
      .qtyCol { width:10%; text-align:center; }
      .unitCol { width:15%; text-align:right; }
      .discCol { width:15%; text-align:right; }
      .totalCol { width:15%; text-align:right; }
      .divider-dotted { border-bottom:1px dotted #000; margin:8px 0; }
      .totals { margin-top:6px; }
      .totals .line { display:flex; justify-content:space-between; font-size:12px; padding:4px 0; }
      .totals .label { font-weight:400; }
      .totals .value { font-weight:700; }
      .paymentTitle { font-weight:700; text-decoration:underline; margin-top:8px; padding-top:6px; }
      .paymentRow { display:flex; justify-content:space-between; padding:4px 0; }
      .footer { text-align:center; font-size:11px; margin-top:8px; }
    </style>
  </head>
  <body>
    <div class="receipt" style="padding:4mm 4mm;">
      <div class="header">
        <div class="company">Multaqa Al-Hadhara Trading L.L.C.</div>
        <div class="meta">CR No: 1202389</div>
        <div class="meta">Muscat, Oman</div>
        <div class="meta">99881702, 93686812</div>
      </div>

      <div class="hr"></div>

      <div class="titleBox">INVOICE / فاتورة</div>

      ${customer ? `<div style="border:1px solid #ddd; padding:6px; margin:6px 0; font-size:11px;">
        <div style="text-align:center; font-weight:700; padding-bottom:6px;">Customer Details / تفاصيل</div>
        <table style="width:100%; font-size:11px; direction:ltr;">
          <tr>
            <td style="width:70%; text-align:left;">Name / الاسم:</td>
            <td style="text-align:right; font-weight:700;">${escapeHtml(customer?.name || customer?.display_name || customer?.partner_name || '')}</td>
          </tr>
          <tr>
            <td style="text-align:left;">Phone / الهاتف:</td>
            <td style="text-align:right; font-weight:700;">${escapeHtml(customer?.phone || customer?.mobile || customer?.phone_number || '')}</td>
          </tr>
        </table>
      </div>` : ''}

      <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:6px;">
        <div style="text-align:left; direction:ltr;">No: ${escapeHtml(orderRef)}</div>
        <div style="text-align:center">Date: ${new Date().toLocaleDateString('en-GB')}</div>
        <div style="text-align:right">Cashier: Admin</div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="totalCol">Total<br/><span style="font-weight:400;font-size:10px;">المجموع</span></th>
            <th class="discCol">Disc<br/><span style="font-weight:400;font-size:10px;">خصم</span></th>
            <th class="unitCol">Unit<br/><span style="font-weight:400;font-size:10px;">سعر</span></th>
            <th class="qtyCol">Qty<br/><span style="font-weight:400;font-size:10px;">كمية</span></th>
            <th class="prodCol">Product<br/><span style="font-weight:400;font-size:10px;">المنتج</span></th>
            <th class="numCol">#</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="divider-dotted"></div>

      <div class="totals">
        <div class="line"><div class="label">Subtotal / المجموع الفرعي</div><div class="value">${formatCurrencyHtml(Number(subtotal || total))}</div></div>
        ${discount > 0 ? `<div class="line"><div class="label">Discount / الخصم</div><div class="value" style="color:#c00;">-${formatCurrencyHtml(discount)}</div></div>` : ''}
        <div style="height:6px; border-bottom:2px solid #000; margin-top:6px;"></div>
        <div class="line" style="font-size:13px; font-weight:700;"><div class="label">Grand Total / الإجمالي</div><div class="value">${formatCurrencyHtml(Number(total || subtotal))}</div></div>
      </div>

      <div style="border-top:1px solid #000; margin-top:8px; padding-top:6px;"></div>
      <div class="paymentTitle">${(payments && payments.length > 1) ? 'Payment Details (Split) / تفاصيل الدفع' : 'Payment Details / تفاصيل الدفع'}</div>
      ${
        (payments && payments.length > 0)
          ? payments.map((p) => `<div class="paymentRow"><div>${escapeHtml(p.method_name || 'Payment')}:</div><div>${formatCurrencyHtml(Number(p.amount) || 0)}</div></div>`).join('')
            + (Number(paidAmount) > Number(total || subtotal)
                ? `<div class="paymentRow"><div>Change / الباقي:</div><div>${formatCurrencyHtml(Number(paidAmount) - Number(total || subtotal))}</div></div>`
                : '')
          : `<div class="paymentRow"><div>Cash:</div><div>${formatCurrencyHtml(Number(paidAmount > 0 ? paidAmount : (total || subtotal)))}</div></div>
             <div class="paymentRow"><div>Change / الباقي:</div><div>${formatCurrencyHtml(Number((paidAmount > (total || subtotal) ? (paidAmount - (total || subtotal)) : 0)))}</div></div>`
      }

      <div style="height:8px; border-bottom:1px dotted #000; margin-top:8px;"></div>
      <div class="footer">Thank you for your purchase!<br/>شكرا لشرائك!</div>
    </div>
  </body>
  </html>`;

  return html;
};

export default generateInvoiceHtml;
