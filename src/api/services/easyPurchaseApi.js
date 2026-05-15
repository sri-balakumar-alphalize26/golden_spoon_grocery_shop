// src/api/services/easyPurchaseApi.js
//
// Native React Native bridge for the `easy_purchase` Odoo module.
// All calls are JSON-RPC against /web/dataset/call_kw using the same
// session cookie that the rest of the app uses for Odoo (see odooConfig).

import axios from 'axios';
import { getOdooUrl, getOdooDb } from '@api/config/odooConfig';

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
    const msg = err?.data?.message || err?.message || 'Odoo error';
    const wrapped = new Error(msg);
    wrapped.odoo = err;
    throw wrapped;
  }
  return resp.data?.result;
};

// ────────────────────────────────────────────────────────────────────
// Easy Purchase entries
// ────────────────────────────────────────────────────────────────────

export const fetchEasyPurchases = async ({ state = '', limit = 50, offset = 0 } = {}) => {
  const domain = state ? [['state', '=', state]] : [];
  return callKw('easy.purchase.app', 'search_read', [domain], {
    fields: [
      'id', 'name', 'date', 'partner_id', 'company_id', 'currency_id',
      'amount_untaxed', 'amount_tax', 'amount_total', 'state', 'payment_state',
      'payment_method_id', 'reference',
    ],
    order: 'date desc, id desc',
    limit,
    offset,
  });
};

export const fetchEasyPurchaseDetail = async (id) => {
  if (!id) throw new Error('id is required');
  const [record] = await callKw('easy.purchase.app', 'read', [[Number(id)]], {
    fields: [
      'id', 'name', 'date', 'partner_id', 'company_id', 'currency_id',
      'discount_type', 'line_ids', 'state', 'payment_state',
      'amount_untaxed', 'amount_tax', 'amount_total',
      'purchase_order_id', 'picking_id', 'invoice_id', 'payment_ids',
      'reference', 'notes', 'auto_validate_bill', 'auto_register_payment',
      'warehouse_id', 'payment_method_id', 'payment_term_id', 'is_credit_purchase',
    ],
  });
  let lines = [];
  if (record?.line_ids?.length) {
    lines = await callKw('easy.purchase.line.app', 'read', [record.line_ids], {
      fields: [
        'id', 'sequence', 'display_type', 'name', 'product_id', 'description',
        'quantity', 'uom_id', 'price_unit', 'discount', 'discount_type',
        'tax_ids', 'subtotal', 'tax_amount', 'total',
      ],
    });
  }
  return { ...record, lines };
};

export const createEasyPurchase = async (vals) => {
  // vals shape: { date, partner_id, payment_method_id, warehouse_id, currency_id?,
  //   discount_type, reference?, notes?, auto_validate_bill, auto_register_payment,
  //   payment_term_id?, lines: [ { product_id, description?, quantity, uom_id?, price_unit, discount?, tax_ids? } ] }
  const payload = { ...vals };
  const lines = payload.lines || [];
  delete payload.lines;
  payload.line_ids = lines.map((l) => [0, 0, {
    product_id: l.product_id,
    description: l.description || '',
    quantity: Number(l.quantity) || 0,
    ...(l.uom_id ? { uom_id: l.uom_id } : {}),
    price_unit: Number(l.price_unit) || 0,
    discount: Number(l.discount) || 0,
    ...(Array.isArray(l.tax_ids) && l.tax_ids.length ? { tax_ids: [[6, 0, l.tax_ids]] } : {}),
  }]);
  const id = await callKw('easy.purchase.app', 'create', [payload]);
  return id;
};

export const confirmEasyPurchase = async (id) => callKw('easy.purchase.app', 'action_confirm', [[Number(id)]]);
export const cancelEasyPurchase = async (id) => callKw('easy.purchase.app', 'action_cancel', [[Number(id)]]);
export const draftEasyPurchase = async (id) => callKw('easy.purchase.app', 'action_draft', [[Number(id)]]);

// ────────────────────────────────────────────────────────────────────
// Payment Methods
// ────────────────────────────────────────────────────────────────────

export const fetchPaymentMethods = async ({ active = true } = {}) => {
  const domain = active ? [['active', '=', true]] : [];
  return callKw('easy.purchase.payment.method.app', 'search_read', [domain], {
    fields: [
      'id', 'name', 'sequence', 'active', 'company_id',
      'journal_id', 'journal_type', 'is_default', 'is_vendor_account', 'notes',
    ],
    order: 'sequence, id',
  });
};

export const createPaymentMethod = async (vals) =>
  callKw('easy.purchase.payment.method.app', 'create', [vals]);

export const updatePaymentMethod = async (id, vals) =>
  callKw('easy.purchase.payment.method.app', 'write', [[Number(id)], vals]);

export const deletePaymentMethod = async (id) =>
  callKw('easy.purchase.payment.method.app', 'unlink', [[Number(id)]]);

// ────────────────────────────────────────────────────────────────────
// Pickers / dropdown sources
// ────────────────────────────────────────────────────────────────────

export const fetchVendors = async ({ searchText = '', limit = 25 } = {}) => {
// No `supplier_rank > 0` filter — matches Odoo's default Vendor field which
// shows every res.partner record (Administrator, My Company, contacts, etc.).
const domain = [];
if (searchText) domain.push(['name', 'ilike', searchText]);
return callKw('res.partner', 'search_read', [domain], {
fields: ['id', 'name', 'email', 'phone', 'city', 'country_id', 'is_company', 'parent_id'],
order: 'name',
limit,
});
};

export const fetchPurchaseProducts = async ({ searchText = '', limit = 25 } = {}) => {
  const domain = [['purchase_ok', '=', true]];
  if (searchText) domain.push(['name', 'ilike', searchText]);
  return callKw('product.product', 'search_read', [domain], {
    fields: [
      'id', 'name', 'display_name', 'default_code', 'barcode',
      'standard_price', 'lst_price', 'uom_id', 'supplier_taxes_id', 'image_128',
    ],
    order: 'name',
    limit,
  });
};

// Read a single product (used by Print-on-line: we only stash product_id on
// saved lines, so we re-read fresh prices/barcode when the user taps Print).
export const readProduct = async (id) => {
  if (!id) return null;
  const [rec] = await callKw('product.product', 'read', [[Number(id)]], {
    fields: ['id', 'name', 'display_name', 'default_code', 'barcode', 'standard_price', 'lst_price'],
  });
  return rec || null;
};

export const fetchUoms = async () =>
  callKw('uom.uom', 'search_read', [[]], { fields: ['id', 'name', 'category_id'], order: 'name' });

export const fetchPurchaseTaxes = async () =>
  callKw('account.tax', 'search_read', [[['type_tax_use', '=', 'purchase']]], {
    fields: ['id', 'name', 'amount', 'amount_type', 'price_include'],
    order: 'sequence, id',
  });

export const fetchWarehouses = async () =>
  callKw('stock.warehouse', 'search_read', [[]], { fields: ['id', 'name', 'code', 'company_id'], order: 'name' });

export const fetchPaymentTerms = async () =>
  callKw('account.payment.term', 'search_read', [[]], { fields: ['id', 'name'], order: 'sequence, id' });

export const fetchAccountJournals = async () =>
  callKw('account.journal', 'search_read', [[['type', 'in', ['cash', 'bank']]]], {
    fields: ['id', 'name', 'type', 'company_id'],
    order: 'name',
  });

// ────────────────────────────────────────────────────────────────────
// Linked record reads (for the Detail screen)
// ────────────────────────────────────────────────────────────────────

export const readPurchaseOrder = async (id) => {
  if (!id) return null;
  const [rec] = await callKw('purchase.order', 'read', [[Number(id)]], {
    fields: ['id', 'name', 'state', 'partner_id', 'amount_total', 'date_order'],
  });
  return rec || null;
};

export const readStockPicking = async (id) => {
  if (!id) return null;
  const [rec] = await callKw('stock.picking', 'read', [[Number(id)]], {
    fields: ['id', 'name', 'state', 'origin', 'partner_id', 'scheduled_date'],
  });
  return rec || null;
};

export const readVendorBill = async (id) => {
  if (!id) return null;
  const [rec] = await callKw('account.move', 'read', [[Number(id)]], {
    fields: ['id', 'name', 'state', 'payment_state', 'amount_total', 'invoice_date', 'partner_id'],
  });
  return rec || null;
};

export const readPayments = async (ids = []) => {
  if (!ids?.length) return [];
  return callKw('account.payment', 'read', [ids.map(Number)], {
    fields: ['id', 'name', 'amount', 'state', 'date', 'journal_id', 'partner_id'],
  });
};

// ────────────────────────────────────────────────────────────────────
// Barcode print
// ────────────────────────────────────────────────────────────────────

export const printBarcodeLabel = async ({
  productId,
  quantity = 1,
  labelSize = '38x25',
  priceType = 'retail',
  retailPrice = 0,
  wholesalePrice = 0,
  lineId = false,
}) => {
  if (!productId) throw new Error('productId is required');
  const wizardId = await callKw('easy.purchase.barcode.wizard.app', 'create', [{
    product_id: Number(productId),
    quantity: Math.max(1, parseInt(quantity, 10) || 1),
    label_size: labelSize,
    price_type: priceType,
    retail_price: Number(retailPrice) || 0,
    wholesale_price: Number(wholesalePrice) || 0,
    ...(lineId ? { line_id: Number(lineId) } : {}),
  }]);
  // action_print returns an ir.actions.report dict — the React Native side can't
  // render Odoo PDFs natively; we instead expose the report URL the user can
  // open in a WebView or share.
  const reportUrl = `${getOdooUrl()}/report/pdf/easy_purchase_apps.action_report_easy_purchase_barcode_app/${wizardId}`;
  return { wizardId, reportUrl };
};
