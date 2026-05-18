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

import { getActiveCurrency, getDigits } from './currency';

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
  service = 0,
  total = 0,
  discount = 0,
  orderId = '',
  orderName = '',
  paidAmount = 0,
  customer = null,
  payments = [],
  // Paper width in millimetres for the @page + .receipt CSS. Defaults to
  // 80mm (the original thermal-receipt size, ≈3.15"). Other supported
  // values from the in-app PaperSizeModal: 50 (2"), 76 (3"), 100 (4"),
  // 148 (A5 → fixed-height A5 page), 210 (A4 → fixed-height A4 page).
  paperWidthMm = 80,
  // Letterhead from Odoo res.company (cached via useAuthStore().companyProfile
  // at login). When omitted, the header falls back to a generic "Company"
  // label so the printed receipt never leaks an old hardcoded name.
  companyProfile = null,
  // Display name of the logged-in Odoo user (res.users.name) for the
  // "Cashier: …" line on the printed receipt. Falls back to "Cashier" so
  // we never leak the old hardcoded "Admin" literal.
  cashierName = 'Cashier',
} = {}) => {
  console.log('[INVOICE:HTML] injecting company =', companyProfile?.name || '(none)', 'cashier =', cashierName);
  const pageWidth = Math.max(20, Number(paperWidthMm) || 80);
  const receiptWidth = Math.max(10, pageWidth - 8);  // 4mm margin × 2
  // A4/A5 use the CSS named page size so printers paginate onto fixed-height
  // sheets. Thermal widths keep `auto` height for one continuous strip.
  const pageSizeCss =
    pageWidth === 210 ? 'A4' :
    pageWidth === 148 ? 'A5' :
    `${pageWidth}mm auto`;
  const orderRef = extractOrderRef(orderName, orderId);
  // Use the active currency (set by post-login fetch and boot-time hydration
  // from AsyncStorage) and the active "Product Price" decimal precision pulled
  // from Odoo's decimal.precision table. Matches the rest of the app —
  // formatCurrency() in currency.js uses the same getDigits() lookup.
  const _cur = getActiveCurrency();
  const CURRENCY_SYMBOL = _cur.symbol || _cur.name || '';
  const PRICE_DIGITS = getDigits('Product Price', 2);
  const formatCurrencyHtml = (amount) => {
    const num = Number(amount);
    const safe = isNaN(num) ? 0 : num;
    return CURRENCY_SYMBOL
      ? `${CURRENCY_SYMBOL} ${safe.toFixed(PRICE_DIGITS)}`
      : safe.toFixed(PRICE_DIGITS);
  };

  const rows = items.map((item, idx) => {
    const itemQty = item.qty || item.quantity || 1;
    const itemPrice = item.price || item.unit || item.price_unit || 0;
    const discountPercent = Number(item.discount_percent || item.discount || 0);
    const grossTotal = itemPrice * itemQty;
    const itemDiscount = item.discount_amount || (grossTotal * discountPercent / 100);
    const itemTotal = item.subtotal ?? (grossTotal - itemDiscount);
    const nameEsc = escapeHtml(item.name || 'Product');
    const rawNote = item.customer_note || item.note || '';
    const noteEsc = rawNote ? escapeHtml(String(rawNote)) : '';
    const noteBlock = noteEsc
      ? `<div style="font-size:9px; color:#666; margin-top:2px; font-style:italic;">📝 ${noteEsc}</div>`
      : '';
    return `<tr>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${formatCurrencyHtml(itemTotal)}</span></td>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${itemDiscount > 0 ? '-' + formatCurrencyHtml(itemDiscount) : '0'}</span></td>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${formatCurrencyHtml(itemPrice)}</span></td>
      <td style="padding:6px 4px; text-align:center; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${itemQty}</span></td>
      <td style="padding:6px 4px; vertical-align:top;">${nameEsc}<div style="font-size:10px; color:#333; margin-top:4px;">KG</div>${noteBlock}</td>
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
      @page { size: ${pageSizeCss}; margin: 4mm; }
      html,body { margin:0; padding:0; }
      .receipt { width:${receiptWidth}mm; margin:0 auto; box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; color:#111; direction: rtl; }
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
        <div class="company">${escapeHtml(companyProfile?.name || 'Company')}</div>
        ${companyProfile?.street ? `<div class="meta">${escapeHtml(companyProfile.street)}</div>` : ''}
        ${companyProfile?.street2 ? `<div class="meta">${escapeHtml(companyProfile.street2)}</div>` : ''}
        ${[companyProfile?.city, companyProfile?.state, companyProfile?.zip].filter(Boolean).length
          ? `<div class="meta">${escapeHtml([companyProfile?.city, companyProfile?.state, companyProfile?.zip].filter(Boolean).join(', '))}</div>`
          : ''}
        ${companyProfile?.country ? `<div class="meta">${escapeHtml(companyProfile.country)}</div>` : ''}
        ${companyProfile?.phone ? `<div class="meta">${escapeHtml(companyProfile.phone)}</div>` : ''}
        ${companyProfile?.email ? `<div class="meta">${escapeHtml(companyProfile.email)}</div>` : ''}
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
        <div style="text-align:right">Cashier: ${escapeHtml(cashierName || 'Cashier')}</div>
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

// Daily Sale summary — generated from the Closing Register modal in
// POSRegister.js. Prints a one-page A4 breakdown of the current session's
// takings (orders, payments by method, cash drawer reconciliation) so the
// cashier has a paper trail of the day's totals to file/hand off.
export const generateDailySaleHtml = ({
  session = {},
  closeDetails = {},
  countedCash = 0,
  closingNote = '',
  companyProfile = null,
  cashierName = 'Cashier',
} = {}) => {
  const _cur = getActiveCurrency();
  const CURRENCY_SYMBOL = _cur.symbol || _cur.name || '';
  const PRICE_DIGITS = getDigits('Product Price', 2);
  const fmt = (n) => {
    const v = Number(n);
    const safe = Number.isFinite(v) ? v : 0;
    return CURRENCY_SYMBOL ? `${CURRENCY_SYMBOL} ${safe.toFixed(PRICE_DIGITS)}` : safe.toFixed(PRICE_DIGITS);
  };

  const methods = closeDetails.methods || [];
  const payments = closeDetails.payments || [];
  const cashMoves = closeDetails.cashMoves || [];
  const orderCount = closeDetails.orderCount || 0;
  const orderTotal = closeDetails.orderTotal || 0;

  const openingCash = Number(session.cash_register_balance_start) || 0;
  const cashInOutTotal = cashMoves.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const cashMethod = methods.find((m) => m.is_cash_count) || null;
  const sumForMethod = (mid) => payments
    .filter((p) => Array.isArray(p.payment_method_id) && p.payment_method_id[0] === mid)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paymentsInCash = cashMethod ? sumForMethod(cashMethod.id) : 0;
  const cashExpected = openingCash + cashInOutTotal + paymentsInCash;
  const cashCountedNum = Number(countedCash) || 0;
  const cashDiff = cashCountedNum - cashExpected;

  const sessionName = escapeHtml(session.name || '—');
  const registerName = Array.isArray(session.config_id) ? escapeHtml(session.config_id[1] || '—') : '—';
  const startAt = session.start_at ? escapeHtml(String(session.start_at)) : '—';
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const companyName = escapeHtml(companyProfile?.name || 'Company');

  const methodRows = methods.map((m) => {
    const amount = sumForMethod(m.id);
    const tag = m.is_cash_count ? 'Cash' : (m.split_transactions ? 'Customer Account' : 'Bank');
    return `<tr>
      <td>${escapeHtml(m.name || '—')}</td>
      <td style="color:#6b7280;">${tag}</td>
      <td style="text-align:right;">${fmt(amount)}</td>
    </tr>`;
  }).join('');

  const cashMovesRows = cashMoves.length
    ? cashMoves.map((c) => `<tr>
        <td>${escapeHtml(c.name || '—')}</td>
        <td style="text-align:right;">${fmt(c.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="2" style="text-align:center; color:#9ca3af;">No cash in/out moves</td></tr>';

  const closingNoteBlock = closingNote
    ? `<div class="section">
         <div class="sectionTitle">Closing Note</div>
         <div class="note">${escapeHtml(closingNote)}</div>
       </div>`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Daily Sale</title>
<style>
  @page { size: A4; margin: 14mm; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  .doc { width: 100%; box-sizing: border-box; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2px solid #111; }
  .titleBlock h1 { margin: 0; font-size: 22px; }
  .titleBlock .sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .meta { font-size: 11px; color: #6b7280; text-align: right; line-height: 1.6; }
  .section { margin-top: 18px; }
  .sectionTitle { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 8px;
                  border-left: 4px solid #7c3aed; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
  th { text-align: left; color: #374151; background: #f9fafb; }
  .summaryRow { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .summaryRow .lbl { color: #6b7280; }
  .summaryRow .val { font-weight: 700; }
  .grand { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; font-size: 14px; }
  .diffNeg { color: #dc2626; font-weight: 700; }
  .note { font-size: 12px; color: #111; background: #f9fafb; border: 1px solid #e5e7eb;
          border-radius: 6px; padding: 10px; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="doc">
    <div class="header">
      <div class="titleBlock">
        <h1>Daily Sale Report</h1>
        <div class="sub">${companyName}</div>
      </div>
      <div class="meta">
        <div><strong>Register:</strong> ${registerName}</div>
        <div><strong>Session:</strong> ${sessionName}</div>
        <div><strong>Cashier:</strong> ${escapeHtml(cashierName)}</div>
        <div><strong>Opened:</strong> ${startAt}</div>
        <div><strong>Generated:</strong> ${generatedAt}</div>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Orders Summary</div>
      <div class="summaryRow"><div class="lbl">Number of orders</div><div class="val">${orderCount}</div></div>
      <div class="summaryRow grand"><div class="lbl">Total sales</div><div class="val">${fmt(orderTotal)}</div></div>
    </div>

    <div class="section">
      <div class="sectionTitle">Payments by Method</div>
      <table>
        <thead><tr><th>Method</th><th>Type</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>${methodRows || '<tr><td colspan="3" style="text-align:center; color:#9ca3af;">No payments</td></tr>'}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="sectionTitle">Cash Drawer</div>
      <div class="summaryRow"><div class="lbl">Opening</div><div class="val">${fmt(openingCash)}</div></div>
      <div class="summaryRow"><div class="lbl">Payments in Cash</div><div class="val">${fmt(paymentsInCash)}</div></div>
      <div class="summaryRow"><div class="lbl">Cash In / Out</div><div class="val">${cashInOutTotal >= 0 ? '+ ' : ''}${fmt(cashInOutTotal)}</div></div>
      <div class="summaryRow"><div class="lbl">Expected</div><div class="val">${fmt(cashExpected)}</div></div>
      <div class="summaryRow"><div class="lbl">Counted</div><div class="val">${fmt(cashCountedNum)}</div></div>
      <div class="summaryRow grand">
        <div class="lbl">Difference</div>
        <div class="val ${cashDiff !== 0 ? 'diffNeg' : ''}">${fmt(cashDiff)}</div>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Cash In / Out Moves</div>
      <table>
        <thead><tr><th>Reason</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>${cashMovesRows}</tbody>
      </table>
    </div>

    ${closingNoteBlock}
  </div>
</body>
</html>`;
};

export default generateInvoiceHtml;
