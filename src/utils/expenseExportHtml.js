// Builders for the Expenses list export. Pure functions — pass formatted
// strings in (date, currency-formatted amount) so this util has no coupling
// to the active currency configuration or date locale of the caller.
//
// Row shape matches what fetchExpensesOdoo / fetchExpenseByIdOdoo normalize:
//   { id, name, date, category: {id,name}|null, employee: {id,name}|null,
//     total_amount, payment_mode, state, description, payment_method_id }

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[m]));

const csvEscape = (s) => {
  const str = String(s ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const STATE_LABEL = {
  draft: 'Draft',
  reported: 'Submitted',
  submitted: 'Submitted',
  approved: 'Approved',
  done: 'Paid',
  paid: 'Paid',
  refused: 'Refused',
};

const paidByLabel = (mode) => (mode === 'company_account' ? 'Company' : 'Employee (to reimburse)');

const pmName = (row) => (Array.isArray(row.payment_method_id) ? row.payment_method_id[1] : '');

const formatDateForExport = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Caller passes:
//   rows: normalized hr.expense rows
//   formatAmount(num) -> formatted string (currency-aware)
//   { filterLabel, totalFormatted, searchText } meta
export const buildExpenseReportHtml = (rows, formatAmount, { filterLabel = 'All', totalFormatted = '', searchText = '' } = {}) => {
  const dateStr = new Date().toLocaleString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const reportTitle = filterLabel && filterLabel !== 'All'
    ? `Expense Report — ${filterLabel}`
    : 'Expense Report';

  const head = `
    <div style="margin-bottom:16px;">
      <div style="font-size:22px;font-weight:800;color:#2E294E;letter-spacing:0.3px;">${escapeHtml(reportTitle)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">
        Filter: <b>${escapeHtml(filterLabel)}</b>${searchText ? ` &nbsp;·&nbsp; Search: <b>${escapeHtml(searchText)}</b>` : ''}
        &nbsp;·&nbsp; Generated: <b>${escapeHtml(dateStr)}</b>
        &nbsp;·&nbsp; Expenses: <b>${rows.length}</b>
      </div>
    </div>
  `;

  const tableRows = rows.map((r) => `
    <tr>
      <td>${escapeHtml(formatDateForExport(r.date))}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.category?.name || '')}</td>
      <td>${escapeHtml(paidByLabel(r.payment_mode))}</td>
      <td>${escapeHtml(pmName(r))}</td>
      <td>${escapeHtml(STATE_LABEL[r.state] || r.state || '')}</td>
      <td style="text-align:right;">${escapeHtml(formatAmount(Number(r.total_amount) || 0))}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color:#1a1a2e; padding:24px; }
          table { width:100%; border-collapse:collapse; font-size:11px; }
          thead tr { background:#2E294E; color:#fff; }
          th, td { padding:8px 10px; border-bottom:1px solid #eef0f5; }
          th { text-align:left; font-size:10px; letter-spacing:0.5px; text-transform:uppercase; }
          tr:nth-child(even) td { background:#fafbfc; }
          tfoot td { font-weight:800; background:#fef3c7; border-top:2px solid #2E294E; }
        </style>
      </head>
      <body>
        ${head}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Paid By</th>
              <th>Payment Method</th>
              <th>Status</th>
              <th style="text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>${tableRows || `<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:24px;">No data</td></tr>`}</tbody>
          <tfoot>
            <tr>
              <td colspan="6">Total</td>
              <td style="text-align:right;">${escapeHtml(totalFormatted)}</td>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>
  `;
};

export const buildExpenseReportCsv = (rows, formatAmount, { totalFormatted = '' } = {}) => {
  const header = [
    'Date', 'Description', 'Category', 'Paid By', 'Payment Method', 'Status', 'Amount',
  ];
  const lines = [header.map(csvEscape).join(',')];
  rows.forEach((r) => {
    lines.push([
      formatDateForExport(r.date),
      r.name || '',
      r.category?.name || '',
      paidByLabel(r.payment_mode),
      pmName(r),
      STATE_LABEL[r.state] || r.state || '',
      formatAmount(Number(r.total_amount) || 0),
    ].map(csvEscape).join(','));
  });
  lines.push(['', '', '', '', '', 'Total', totalFormatted].map(csvEscape).join(','));
  return lines.join('\r\n');
};
