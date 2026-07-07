// src/api/services/quickPurchaseReturnApi.js
//
// React Native bridge for the `quick_purchase_return_apps` Odoo module
// (the .app-suffixed parallel build that coexists with the original
// quick_purchase_return module). All calls are JSON-RPC against
// /web/dataset/call_kw using the same session cookie the rest of the
// app uses for Odoo.

import axios from 'axios';
import { getOdooUrl, getOdooDb } from '@api/config/odooConfig';
import { useAuthStore } from '@stores/auth';

const getCurrentCompanyId = () => {
  try {
    const u = useAuthStore.getState().user;
    const raw = u?.company_id ?? u?.company?.id ?? u?.companyId;
    const id = Array.isArray(raw) ? raw[0] : raw;
    return Number(id) || 1;
  } catch (_) { return 1; }
};

const buildPayload = (model, method, args, kwargs = {}) => ({
  jsonrpc: '2.0',
  method: 'call',
  params: { model, method, args, kwargs },
  id: Date.now(),
});

const headers = () => {
  const db = getOdooDb();
  return {
    'Content-Type': 'application/json',
    ...(db ? { 'X-Odoo-Database': db } : {}),
  };
};

const callKw = async (model, method, args, kwargs = {}) => {
  const url = `${getOdooUrl()}/web/dataset/call_kw`;
  const payload = buildPayload(model, method, args, kwargs);
  const resp = await axios.post(url, payload, { headers: headers(), withCredentials: true });
  if (resp.data?.error) {
    const err = resp.data.error;
    const msg = err?.data?.message || err?.message || 'Server error';
    const wrapped = new Error(msg);
    wrapped.odoo = err;
    throw wrapped;
  }
  return resp.data?.result;
};

// ────────────────────────────────────────────────────────────────────
// Quick Purchase Return list + detail
// ────────────────────────────────────────────────────────────────────

export const fetchQuickReturns = async ({ state = '', limit = 50, offset = 0 } = {}) => {
  const domain = state ? [['state', '=', state]] : [];
  const rows = await callKw('quick.purchase.return.app', 'search_read', [domain], {
    fields: [
      'id', 'name', 'date', 'partner_id', 'company_id', 'currency_id',
      'amount_untaxed', 'amount_tax', 'amount_total', 'state',
      'source_invoice_id', 'credit_note_id', 'return_picking_id',
    ],
    order: 'date desc, id desc',
    limit,
    offset,
  });
  return Array.isArray(rows) ? rows : [];
};

export const fetchQuickReturnDetail = async (id) => {
  if (!id) throw new Error('id is required');
  const [record] = await callKw('quick.purchase.return.app', 'read', [[Number(id)]], {
    fields: [
      'id', 'name', 'date', 'partner_id', 'company_id', 'currency_id',
      'source_invoice_id', 'invoice_date', 'line_ids', 'state',
      'amount_untaxed', 'amount_tax', 'amount_total',
      'credit_note_id', 'return_picking_id', 'auto_post_credit_note',
      'auto_validate_picking', 'warehouse_id', 'notes',
    ],
  });
  // Diagnostic: tells us whether Odoo even has line_ids on this row. If
  // length === 0 the upstream bill-pick step didn't materialize the lines.
  console.log('[QR:DETAIL] record.line_ids =', record?.line_ids);
  let lines = [];
  if (record?.line_ids?.length) {
    try {
      lines = await callKw('quick.purchase.return.line.app', 'read', [record.line_ids], {
        fields: [
          'id', 'sequence', 'source_invoice_line_id', 'product_id', 'description',
          'purchased_qty', 'already_returned_qty', 'returnable_qty', 'return_qty',
          'uom_id', 'price_unit', 'discount', 'tax_ids',
          'subtotal', 'tax_amount', 'total',
        ],
      });
    } catch (e) {
      // Was silently swallowed before — without this we never knew whether
      // the line-read RPC was rejected by Odoo (e.g. invalid field names
      // on a stripped install).
      console.warn('[QR:DETAIL] line read failed:', e?.payload?.data?.message || e?.message);
    }
  }
  console.log(
    '[QR:DETAIL] fetched lines.length =', lines?.length,
    ' first line keys =', lines?.[0] ? Object.keys(lines[0]).join(',') : '<none>'
  );
  return { ...record, lines };
};

export const createQuickReturn = async (vals) => {
  // vals shape: { date, source_invoice_id, warehouse_id, auto_post_credit_note,
  //   auto_validate_picking, notes, line_ids? — but typically lines are auto-
  //   loaded by the model's onchange / lines_autoloaded compute on save+open. }
  const payload = { ...vals };
  const lines = payload.line_ids || [];
  delete payload.line_ids;
  if (lines.length) {
    payload.line_ids = lines.map((l) => [0, 0, {
      source_invoice_line_id: l.source_invoice_line_id,
      product_id: l.product_id,
      description: l.description || '',
      purchased_qty: Number(l.purchased_qty) || 0,
      already_returned_qty: Number(l.already_returned_qty) || 0,
      returnable_qty: Number(l.returnable_qty) || 0,
      return_qty: Number(l.return_qty) || 0,
      ...(l.uom_id ? { uom_id: l.uom_id } : {}),
      price_unit: Number(l.price_unit) || 0,
      discount: Number(l.discount) || 0,
      ...(Array.isArray(l.tax_ids) && l.tax_ids.length ? { tax_ids: [[6, 0, l.tax_ids]] } : {}),
    }]);
  }
  return callKw('quick.purchase.return.app', 'create', [payload]);
};

export const updateQuickReturn = async (id, vals) =>
  callKw('quick.purchase.return.app', 'write', [[Number(id)], vals]);

// Update one return line's return_qty (the editable field on the form).
export const updateReturnLineQty = async (lineId, qty) =>
  callKw('quick.purchase.return.line.app', 'write',
    [[Number(lineId)], { return_qty: Number(qty) || 0 }]);

export const confirmQuickReturn = async (id) =>
  callKw('quick.purchase.return.app', 'action_confirm', [[Number(id)]]);

export const cancelQuickReturn = async (id) =>
  callKw('quick.purchase.return.app', 'action_cancel', [[Number(id)]]);

export const draftQuickReturn = async (id) =>
  callKw('quick.purchase.return.app', 'action_draft', [[Number(id)]]);

export const loadInvoiceLines = async (id) =>
  callKw('quick.purchase.return.app', 'action_load_lines', [[Number(id)]]);

export const returnFullQuantity = async (id) =>
  callKw('quick.purchase.return.app', 'action_return_full', [[Number(id)]]);

// ────────────────────────────────────────────────────────────────────
// Pickers
// ────────────────────────────────────────────────────────────────────

// Posted vendor bills available to return against. The module's domain
// excludes bills already fully returned via `is_fully_returned_purchase_app`.
// We don't filter on that here so the picker shows whatever the cashier
// might want — let the model's onchange surface "nothing to return" if a
// bill has nothing left.
export const fetchReturnableVendorBills = async ({ searchText = '', limit = 25 } = {}) => {
  const companyId = getCurrentCompanyId();

  // Bills that are already used by an active (non-cancelled) return are
  // locked — picking the same bill twice would duplicate the return or
  // fail validation. Cancelled returns release the bill so the user can
  // re-do it. Small RPC ('id' + the Many2one only).
  let usedBillIds = [];
  try {
    const usedReturns = await callKw('quick.purchase.return.app', 'search_read', [
      [['state', '!=', 'cancelled']],
    ], { fields: ['source_invoice_id'], limit: 1000 });
    usedBillIds = (usedReturns || [])
      .map((r) => (Array.isArray(r.source_invoice_id) ? r.source_invoice_id[0] : null))
      .filter(Boolean);
  } catch (e) {
    // If the lookup fails, degrade gracefully — show all bills rather than
    // erroring the picker. Worst case the user re-picks an in-use bill
    // and gets the existing validation error.
    console.warn('[QR:BILLS] used-bill lookup failed:', e?.message);
  }

  const domain = [
    ['move_type', '=', 'in_invoice'],
    ['state', '=', 'posted'],
  ];
  if (usedBillIds.length) {
    domain.push(['id', 'not in', usedBillIds]);
  }
  if (searchText && searchText.trim()) {
    domain.push(['name', 'ilike', searchText.trim()]);
  }
  return callKw('account.move', 'search_read', [domain], {
    fields: [
      'id', 'name', 'partner_id', 'invoice_date', 'amount_total',
      'currency_id', 'state', 'company_id',
    ],
    order: 'invoice_date desc, id desc',
    limit,
    context: { allowed_company_ids: [companyId] },
  });
};

// Preview the lines of a vendor bill BEFORE creating the return record.
// The form uses this to render the line list immediately on bill pick so the
// cashier can see what they're about to return; on save the server-side
// onchange re-creates them as quick.purchase.return.line.app records.
export const fetchVendorBillLines = async (invoiceId) => {
  if (!invoiceId) return [];
  const [bill] = await callKw('account.move', 'read', [[Number(invoiceId)], ['invoice_line_ids']]);
  const lineIds = Array.isArray(bill?.invoice_line_ids) ? bill.invoice_line_ids : [];
  if (lineIds.length === 0) return [];
  return callKw('account.move.line', 'read', [lineIds], {
    fields: [
      'id', 'display_type', 'product_id', 'name', 'quantity',
      'product_uom_id', 'price_unit', 'discount', 'tax_ids',
    ],
  });
};

// ────────────────────────────────────────────────────────────────────
// Linked record reads — for the Detail screen
// ────────────────────────────────────────────────────────────────────

export const readSourceInvoice = async (id) => {
  if (!id) return null;
  const [rec] = await callKw('account.move', 'read', [[Number(id)]], {
    fields: ['id', 'name', 'state', 'payment_state', 'amount_total', 'invoice_date', 'partner_id'],
  });
  return rec || null;
};

export const readCreditNote = async (id) => {
  if (!id) return null;
  const [rec] = await callKw('account.move', 'read', [[Number(id)]], {
    fields: ['id', 'name', 'state', 'payment_state', 'amount_total', 'invoice_date', 'partner_id', 'move_type'],
  });
  return rec || null;
};

export const readReturnPicking = async (id) => {
  if (!id) return null;
  const [rec] = await callKw('stock.picking', 'read', [[Number(id)]], {
    fields: ['id', 'name', 'state', 'origin', 'partner_id', 'scheduled_date'],
  });
  return rec || null;
};
