// Full workflow: create invoice, post, pay, and log status
export const processInvoiceWithPaymentOdoo = async ({ partnerId, products = [], journalId, invoiceDate = null, reference = '', paymentAmount = null } = {}) => {
  try {
    console.log('[PROCESS] Starting processInvoiceWithPaymentOdoo with params:', { partnerId, products, journalId, invoiceDate, reference, paymentAmount });

    // Step 0: If journalId is not provided, fetch and select sales journal
    let finalJournalId = journalId;
    if (!finalJournalId) {
      const journals = await fetchPaymentJournalsOdoo();
      const salesJournal = journals.find(j => j.type === 'sale');
      if (!salesJournal) throw new Error('No sales journal found in Odoo.');
      finalJournalId = salesJournal.id;
      console.log('[PROCESS] Auto-selected sales journal:', salesJournal);
    }

    // Step 1: Create and post invoice
    const invoiceResult = await createInvoiceOdoo({ partnerId, products, journalId: finalJournalId, invoiceDate, reference });
    console.log('[PROCESS] Invoice creation result:', invoiceResult);
    if (!invoiceResult.id) {
      throw new Error('Invoice creation failed');
    }
    if (invoiceResult.posted) {
      console.log('[PROCESS] Invoice is posted (ready for payment).');
    } else {
      throw new Error('Invoice was created but not posted. Cannot proceed with payment.');
    }

    // Step 2: Register payment for invoice
    let amount = paymentAmount;
    if (amount === null) {
      amount = products.reduce((sum, p) => sum + (p.price || p.price_unit || p.list_price || 0) * (p.quantity || p.qty || 1), 0);
    }

    const paymentResult = await createAccountPaymentOdoo({ partnerId, journalId: finalJournalId, amount, invoiceId: invoiceResult.id });
    console.log('[PROCESS] Payment creation result:', paymentResult);

    if (!paymentResult.result) {
      throw new Error('Payment creation failed');
    }

    // Step 3: Post the payment
    const paymentId = paymentResult.result;
    const postPaymentResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.payment',
          method: 'action_post',
          args: [[paymentId]],
          kwargs: {},
        },
        id: new Date().getTime(),
      }),
    });
    const postPaymentResult = await postPaymentResponse.json();
    console.log('[PROCESS] Payment post result:', postPaymentResult);

    // Step 4: Verify payment reconciliation
    const paymentStatusResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.payment',
          method: 'search_read',
          args: [[['id', '=', paymentId]]],
          kwargs: { fields: ['id', 'reconciled', 'state', 'invoice_ids'] },
        },
        id: new Date().getTime(),
      }),
    });
    const paymentStatus = await paymentStatusResponse.json();
    const paymentDetails = paymentStatus.result?.[0];
    console.log('[PROCESS] Payment details after posting:', paymentDetails);

    if (!paymentDetails.reconciled) {
      console.warn('[PROCESS] Payment is not reconciled. Attempting manual reconciliation.');
      const reconcileResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.payment',
            method: 'reconcile',
            args: [[paymentId]],
            kwargs: {},
          },
          id: new Date().getTime(),
        }),
      });
      const reconcileResult = await reconcileResponse.json();
      console.log('[PROCESS] Manual reconciliation result:', reconcileResult);
    }

    // Step 5: Verify invoice status
    const invoiceStatusResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.move',
          method: 'search_read',
          args: [[['id', '=', invoiceResult.id]]],
          kwargs: { fields: ['id', 'payment_state', 'amount_residual'] },
        },
        id: new Date().getTime(),
      }),
    });
    const invoiceStatus = await invoiceStatusResponse.json();
    const updatedInvoice = invoiceStatus.result?.[0];

    if (updatedInvoice.payment_state === 'paid' && updatedInvoice.amount_residual === 0) {
      console.log('[PROCESS] Invoice payment successfully linked and marked as paid.');
    } else {
      throw new Error('[PROCESS] Invoice payment not fully processed. Check payment state or residual amount.');
    }

    return { invoiceResult, paymentResult, invoiceStatus: updatedInvoice };
  } catch (error) {
    console.error('[PROCESS] processInvoiceWithPaymentOdoo error:', error);
    return { error };
  }
};
// Validate POS order in Odoo to trigger name generation
// Update POS order fields (like amount_paid, state)
export const updatePosOrderOdoo = async (orderId, values) => {
  try {
    console.log(`📝 Updating POS order ${orderId} with:`, values);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], values],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo update pos.order error:', response.data.error);
      return { error: response.data.error };
    }
    console.log('✅ Order updated successfully');
    return { result: response.data.result };
  } catch (error) {
    console.error('updatePosOrderOdoo error:', error);
    return { error };
  }
};

export const validatePosOrderOdoo = async (orderId) => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'action_pos_order_paid',
        args: [[orderId]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo validate pos.order error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('validatePosOrderOdoo error:', error);
    return { error };
  }
};
// Read all pos.payment records attached to a single pos.order. Used by the
// order detail screen so a split-paid order can show "Cash 500 · Card 500"
// instead of just the aggregate "amount_paid". Returns an array shaped like
//   [{ id, amount, method_id, method_name, journal_id, journal_name }, ...]
// The `method_id` and `journal_id` are stripped to scalars (Odoo returns
// many2one fields as [id, name] tuples) so the UI doesn't have to unwrap.
export const fetchPosOrderPaymentsOdoo = async (orderId) => {
  if (!orderId) return [];
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment',
        method: 'search_read',
        args: [[['pos_order_id', '=', Number(orderId)]]],
        kwargs: {
          fields: ['id', 'amount', 'payment_method_id'],
          order: 'id asc',
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data?.error) {
      console.error('fetchPosOrderPaymentsOdoo error:', response.data.error);
      return [];
    }
    const rows = response.data?.result || [];
    return rows.map((p) => {
      const m = p.payment_method_id;
      return {
        id: p.id,
        amount: Number(p.amount) || 0,
        method_id: Array.isArray(m) ? m[0] : m,
        method_name: Array.isArray(m) ? m[1] : '',
      };
    });
  } catch (e) {
    console.error('fetchPosOrderPaymentsOdoo exception:', e);
    return [];
  }
};

// Read pos.payment.method records configured on the active POS register
// (pos.config.payment_method_ids). This is the canonical Odoo way: the cashier
// only sees methods explicitly assigned to that register, and each method
// already carries the journal it should post to. Replaces the older
// "lookup pos.payment.method by journal_id" approach which broke on setups
// where the journal id was guessed wrong (e.g. journal "Point of Sale"
// id=16 with no pos.payment.method record pointing at it).
export const fetchPosConfigPaymentMethods = async (posConfigId) => {
  if (!posConfigId) return [];
  try {
    const baseUrl = getOdooUrl();

    const cfgResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.config',
        method: 'read',
        args: [[Number(posConfigId)], ['id', 'name', 'payment_method_ids']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (cfgResp.data?.error) {
      console.error('fetchPosConfigPaymentMethods pos.config error:', cfgResp.data.error);
      return [];
    }
    const cfg = (cfgResp.data?.result || [])[0];
    const methodIds = Array.isArray(cfg?.payment_method_ids) ? cfg.payment_method_ids : [];
    if (methodIds.length === 0) return [];

    const methodsResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment.method',
        method: 'read',
        args: [methodIds, ['id', 'name', 'journal_id', 'is_cash_count', 'split_transactions', 'type']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (methodsResp.data?.error) {
      console.error('fetchPosConfigPaymentMethods pos.payment.method error:', methodsResp.data.error);
      return [];
    }
    return methodsResp.data?.result || [];
  } catch (e) {
    console.error('fetchPosConfigPaymentMethods error:', e);
    return [];
  }
};

// Fetch POS registers (configurations) from Odoo
export const fetchPOSRegisters = async ({ limit = null, offset = 0 } = {}) => {
  try {
    const kwargs = { fields: ["id", "name"] };
    if (limit && Number(limit) > 0) kwargs.limit = Number(limit);
    if (offset && Number(offset) > 0) kwargs.offset = Number(offset);

    console.log('[fetchPOSRegisters] request kwargs:', kwargs);

    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "pos.config",
          method: "search_read",
          args: [[]],
          kwargs,
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (pos.config):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    console.log('[fetchPOSRegisters] fetched:', { count: response.data.result?.length ?? 0 });
    return response.data.result || [];
  } catch (error) {
    console.error("fetchPOSRegisters error:", error);
    throw error;
  }
};
// Fetch POS sessions (registers) from Odoo
// `state` accepts a single string ('opened') or an array. The shorthand
// 'opened' is treated as "anything currently active" — i.e. both
// `opening_control` (cash-control screen pending) and `opened` (in progress) —
// because Odoo 19 may keep a freshly-created session in opening_control if
// the auto-advance step is refused.
export const fetchPOSSessions = async ({ limit = 20, offset = 0, state = '' } = {}) => {
  try {
    let domain = [];
    if (Array.isArray(state) && state.length) {
      domain = [["state", "in", state]];
    } else if (state === 'opened') {
      // Strict match: only fully-opened sessions (state === 'opened').
      // Sessions still in `opening_control` (cash-control pending) should appear
      // as "Available Registers" with an "Open Register" button — matching
      // Odoo's POS UI which only shows "Continue Selling" for `opened`.
      domain = [["state", "=", "opened"]];
    } else if (state) {
      domain = [["state", "=", state]];
    }
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "pos.session",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id",
              "name",
              "state",
              "user_id",
              "start_at",
              "stop_at",
              "cash_register_balance_end",
              "cash_register_balance_start",
              "config_id", // Added to allow frontend to extract posConfigId
            ],
            limit,
            offset,
            order: "id desc",
          },
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (pos.session):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }
    return response.data.result || [];
  } catch (error) {
    console.error("fetchPOSSessions error:", error);
    throw error;
  }
};

// Fetch draft `pos.order` records for a session — used when close-register
// fails with "There are still orders in draft state" so we can offer the user
// a one-tap clean-up.
export const fetchDraftPosOrders = async (sessionId) => {
  if (!sessionId) return [];
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['session_id', '=', Number(sessionId)], ['state', '=', 'draft']]],
        kwargs: { fields: ['id', 'name', 'amount_total', 'state'], limit: 200 },
      },
    }, {
      headers: { 'Content-Type': 'application/json', ...(getOdooDb() ? { 'X-Odoo-Database': getOdooDb() } : {}) },
      withCredentials: true,
    });
    if (response.data?.error) {
      console.error('[fetchDraftPosOrders] Odoo error:', response.data.error);
      return [];
    }
    return response.data?.result || [];
  } catch (e) {
    console.error('[fetchDraftPosOrders] exception:', e?.message || e);
    return [];
  }
};

// Delete (unlink) draft pos.order records — equivalent to Odoo's "Discard"
// on each one. Used to unblock close-register after the user confirms.
export const unlinkPosOrders = async (orderIds = []) => {
  if (!orderIds?.length) return { success: true, count: 0 };
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'unlink',
        args: [orderIds.map(Number)],
        kwargs: {},
      },
    }, {
      headers: { 'Content-Type': 'application/json', ...(getOdooDb() ? { 'X-Odoo-Database': getOdooDb() } : {}) },
      withCredentials: true,
    });
    if (response.data?.error) {
      const msg = response.data.error?.data?.message || response.data.error?.message || 'Failed to delete draft orders';
      console.error('[unlinkPosOrders] Odoo error:', msg);
      return { error: msg };
    }
    return { success: true, count: orderIds.length };
  } catch (e) {
    return { error: e?.message || 'Network error' };
  }
};

// Close a POS session in Odoo
export const closePOSSesionOdoo = async ({ sessionId } = {}) => {
  try {
    if (!sessionId) throw new Error('sessionId is required');

    console.log('[CLOSE POS SESSION] Closing session ID:', sessionId);

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.session',
        method: 'action_pos_session_close',
        args: [[sessionId]],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[CLOSE POS SESSION] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    console.log('[CLOSE POS SESSION] Session closed successfully');
    return { success: true, result: response.data.result };
  } catch (error) {
    console.error('closePOSSesionOdoo error:', error);
    return { error };
  }
};

// api/services/generalApi.js
import axios from "axios";
import ODOO_BASE_URL, { getOdooUrl } from '@api/config/odooConfig';


import { get } from "./utils";
import { API_ENDPOINTS } from "@api/endpoints";
import { useAuthStore } from '@stores/auth';
import handleApiError from "../utils/handleApiError";

// Debugging output for useAuthStore
export const fetchProducts = async ({ offset, limit, categoryId, searchText }) => {
  try {
    const queryParams = {
      ...(searchText !== undefined && { product_name: searchText }),
      offset,
      limit,
      ...(categoryId !== undefined && { category_id: categoryId }),
    };
    // Debugging output for queryParams
    const response = await get(API_ENDPOINTS.VIEW_PRODUCTS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};



// 🔹 NEW: Fetch products directly from Odoo 19 via JSON-RPC
// Reverted: Fetch products directly from Odoo 19 via JSON-RPC (ice cube shop logic)
export const fetchProductsOdoo = async ({
  offset = 0,
  limit = 50,
  searchText = '',
  posCategoryId = null,
  categoryId = null,
  posOnly = false,
} = {}) => {
  try {
    let domain = [];
    if (searchText && String(searchText).trim()) {
      const term = String(searchText).trim();
      domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
    }
    if (posCategoryId) {
      domain = domain.concat([['pos_categ_ids', 'in', [Number(posCategoryId)]]]);
    } else if (categoryId) {
      domain = domain.concat([['categ_id', '=', Number(categoryId)]]);
    }
    if (posOnly) {
      domain = domain.concat([['available_in_pos', '=', true]]);
    }

    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "product.product",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id",
              "name",
              "default_code",
              "list_price",
              "qty_available",
              "image_128",
              "categ_id",
              "available_in_pos",
              "product_tmpl_id",
            ],
            offset,
            limit,
            order: "name asc",
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.data.error) {
      console.log("Odoo JSON-RPC error (product.product):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    const results = response.data.result || [];

    // Use `image_128` inline (carried over the authenticated JSON-RPC call) so
    // we never have to hit `/web/image` from the React Native Image component
    // anonymously (which Odoo blocks for non-public users). When image_128 is
    // missing/false the product genuinely has no image and we leave image_url
    // empty so the UI shows a "No Image" placeholder.
    results.forEach(p => {
      const hasBase64 = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0;
      p.image_url = hasBase64 ? `data:image/png;base64,${p.image_128}` : '';
    });

    return results;
  } catch (error) {
    console.error("fetchProductsOdoo error:", error);
    throw error;
  }
};

// ─── Product creation helpers ───────────────────────────────────────────────
// Fetch product.category (internal accounting categories) for the form picker.
export const fetchProductCategoriesOdoo = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.category',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name', 'complete_name'], order: 'name asc', limit: 200 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) return [];
    return (response.data.result || []).map((c) => ({
      id: c.id,
      name: c.complete_name || c.name || '',
    }));
  } catch (e) {
    console.warn('fetchProductCategoriesOdoo error:', e?.message);
    return [];
  }
};

// Fetch pos.category — the POS cashier-screen grouping. Includes the integer
// `color` field so the Products screen can tint each filter chip with the
// same palette the cashier sees in Odoo.
export const fetchPosCategoriesOdoo = async () => {
  const baseUrl = getOdooUrl();
  const callRead = async (model, fields) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method: 'search_read',
        args: [[]],
        kwargs: { fields, order: 'name asc', limit: 200 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result || [];
  };

  // 1) Try pos.category with the rich field set (includes `color`).
  // 2) If that fails, try pos.category without `color`.
  // 3) If pos.category is unavailable entirely (e.g. point_of_sale module not
  //    installed on this DB), fall back to product.category so the form
  //    picker / chip filter still has something to render.
  try {
    let raw;
    try {
      raw = await callRead('pos.category', ['id', 'name', 'color']);
    } catch (err) {
      console.warn(
        'fetchPosCategoriesOdoo pos.category[+color] failed, retrying without color:',
        err?.payload?.data?.message || err?.payload?.message || err?.message
      );
      try {
        raw = await callRead('pos.category', ['id', 'name']);
      } catch (err2) {
        console.warn(
          'fetchPosCategoriesOdoo pos.category unavailable, falling back to product.category:',
          err2?.payload?.data?.message || err2?.payload?.message || err2?.message
        );
        raw = await callRead('product.category', ['id', 'name']);
      }
    }
    return raw.map((c) => ({
      id: c.id,
      name: c.name || '',
      color: typeof c.color === 'number' ? c.color : 0,
    }));
  } catch (e) {
    console.warn(
      'fetchPosCategoriesOdoo error (all sources failed):',
      e?.payload?.data?.message || e?.payload?.message || e?.message
    );
    return [];
  }
};

// Create a new pos.category. Returns { result: <newId> } or { error }.
export const createPosCategoryOdoo = async ({ name, color = 0 } = {}) => {
  if (!name || !String(name).trim()) {
    return { error: { message: 'Category name is required' } };
  }
  const baseUrl = getOdooUrl();
  const vals = { name: String(name).trim() };
  if (color !== undefined && color !== null) vals.color = Number(color) || 0;
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'pos.category', method: 'create', args: [vals], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      return { error: resp.data.error };
    }
    return { result: resp.data.result };
  } catch (e) {
    console.error('createPosCategoryOdoo error:', e?.message);
    return { error: { message: e?.message || 'Create failed' } };
  }
};

// Update an existing pos.category. Same shape as create, plus the id.
export const updatePosCategoryOdoo = async (categoryId, { name, color } = {}) => {
  if (!categoryId) return { error: { message: 'categoryId is required' } };
  const baseUrl = getOdooUrl();
  const vals = {};
  if (name !== undefined) vals.name = String(name).trim();
  if (color !== undefined && color !== null) vals.color = Number(color) || 0;
  if (Object.keys(vals).length === 0) return { result: categoryId };
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'pos.category', method: 'write', args: [[categoryId], vals], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return { error: resp.data.error };
    return { result: categoryId };
  } catch (e) {
    console.error('updatePosCategoryOdoo error:', e?.message);
    return { error: { message: e?.message || 'Update failed' } };
  }
};

// Counts of products per POS category, plus a grand total. Returns
// { all: <int>, [categoryId]: <int>, ... }. Used by the Products screen
// to label each category chip with its count.
export const fetchPosCategoryCountsOdoo = async (categoryIds = []) => {
  const baseUrl = getOdooUrl();
  const counts = { all: 0 };

  const callCount = async (domain) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.product',
        method: 'search_count',
        args: [domain],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      throw new Error(resp.data.error?.data?.message || 'search_count failed');
    }
    return Number(resp.data.result) || 0;
  };

  try {
    counts.all = await callCount([]);
  } catch (e) {
    console.warn('fetchPosCategoryCountsOdoo total failed:', e?.message);
  }

  const pairs = await Promise.all(
    (categoryIds || []).map(async (cid) => {
      try {
        const n = await callCount([['pos_categ_ids', 'in', [Number(cid)]]]);
        return [cid, n];
      } catch (e) {
        return [cid, 0];
      }
    })
  );
  pairs.forEach(([cid, n]) => { counts[cid] = n; });
  return counts;
};

// Fetch uom.uom for the form unit-of-measure picker.
export const fetchUomsOdoo = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'uom.uom',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name'], order: 'name asc', limit: 100 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) return [];
    return (response.data.result || []).map((u) => ({ id: u.id, name: u.name }));
  } catch (e) {
    console.warn('fetchUomsOdoo error:', e?.message);
    return [];
  }
};

// Create a product.product. Mirrors employee_attendance's payload shape but
// online-only (no offline queue). Each optional field is omitted when empty
// so Odoo applies defaults.
export const createProductOdoo = async ({ name, categId, posCategoryId, listPrice, standardPrice, barcode, defaultCode, uomId, image, descriptionSale, onHandQty } = {}) => {
  if (!name || !String(name).trim()) {
    return { error: { message: 'Product name is required' } };
  }
  const baseUrl = getOdooUrl();

  const vals = {
    name: String(name).trim(),
    sale_ok: true,
    purchase_ok: true,
  };
  if (categId) vals.categ_id = categId;
  if (posCategoryId) {
    vals.pos_categ_ids = [[6, 0, [posCategoryId]]];
    // Setting a POS category implies the product should show on the POS.
    // Auto-tick `available_in_pos` so the cashier screen picks it up.
    vals.available_in_pos = true;
  }
  if (listPrice !== undefined && listPrice !== '' && listPrice !== null) vals.list_price = Number(listPrice) || 0;
  if (standardPrice !== undefined && standardPrice !== '' && standardPrice !== null) vals.standard_price = Number(standardPrice) || 0;
  if (barcode) vals.barcode = String(barcode).trim();
  if (defaultCode) vals.default_code = String(defaultCode).trim();
  if (uomId) { vals.uom_id = uomId; }
  if (descriptionSale) vals.description_sale = String(descriptionSale).trim();
  if (image) vals.image_1920 = image;

  const callCreate = async (payload) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'product.product', method: 'create', args: [payload], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result;
  };

  let productId;
  try {
    productId = await callCreate(vals);
  } catch (err) {
    console.warn('createProductOdoo full create failed, retrying with safe fields:', err?.payload || err?.message);
    const safe = {
      name: vals.name,
      sale_ok: true,
      purchase_ok: true,
    };
    if (vals.list_price !== undefined) safe.list_price = vals.list_price;
    if (vals.standard_price !== undefined) safe.standard_price = vals.standard_price;
    if (vals.default_code) safe.default_code = vals.default_code;
    if (vals.barcode) safe.barcode = vals.barcode;
    if (vals.image_1920) safe.image_1920 = vals.image_1920;
    if (vals.description_sale) safe.description_sale = vals.description_sale;
    try {
      productId = await callCreate(safe);
    } catch (err2) {
      console.error('createProductOdoo safe create also failed:', err2?.payload || err2?.message);
      return { error: err2?.payload || { message: err2?.message || 'Create failed' } };
    }
  }

  // Optional: bump on-hand qty via stock.change.product.qty wizard.
  if (onHandQty !== undefined && onHandQty !== '' && Number(onHandQty) > 0 && productId) {
    try {
      const wizardResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.change.product.qty',
          method: 'create',
          args: [{ product_id: productId, new_quantity: Number(onHandQty) }],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const wizId = wizardResp.data?.result;
      if (wizId) {
        await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: { model: 'stock.change.product.qty', method: 'change_product_qty', args: [[wizId]], kwargs: {} },
        }, { headers: { 'Content-Type': 'application/json' } });
      }
    } catch (qtyErr) {
      console.warn('createProductOdoo on-hand qty step failed:', qtyErr?.payload || qtyErr?.message);
    }
  }

  return { result: productId };
};

// Update an existing product.product. Same payload shape as createProductOdoo,
// with the same safe-fields fallback. `onHandQty` triggers the
// stock.change.product.qty wizard the same way create does.
export const updateProductOdoo = async (productId, { name, categId, posCategoryId, listPrice, standardPrice, barcode, defaultCode, uomId, image, descriptionSale, onHandQty } = {}) => {
  if (!productId) return { error: { message: 'productId is required' } };
  const baseUrl = getOdooUrl();

  const vals = {};
  if (name !== undefined) vals.name = String(name).trim();
  if (categId !== undefined) vals.categ_id = categId || false;
  if (posCategoryId !== undefined) {
    vals.pos_categ_ids = posCategoryId ? [[6, 0, [posCategoryId]]] : [[5, 0, 0]];
    if (posCategoryId) vals.available_in_pos = true;
  }
  if (listPrice !== undefined && listPrice !== null && listPrice !== '') vals.list_price = Number(listPrice) || 0;
  if (standardPrice !== undefined && standardPrice !== null && standardPrice !== '') vals.standard_price = Number(standardPrice) || 0;
  if (barcode !== undefined) vals.barcode = barcode ? String(barcode).trim() : false;
  if (defaultCode !== undefined) vals.default_code = defaultCode ? String(defaultCode).trim() : false;
  if (uomId !== undefined) { vals.uom_id = uomId; }
  if (descriptionSale !== undefined) vals.description_sale = descriptionSale ? String(descriptionSale).trim() : false;
  if (image) vals.image_1920 = image;

  const callWrite = async (payload) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'product.product', method: 'write', args: [[productId], payload], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result;
  };

  let partial = false;
  try {
    await callWrite(vals);
  } catch (err) {
    console.warn('updateProductOdoo full write failed, retrying with safe fields:', err?.payload || err?.message);
    const safe = {};
    if (vals.name !== undefined) safe.name = vals.name;
    if (vals.list_price !== undefined) safe.list_price = vals.list_price;
    if (vals.standard_price !== undefined) safe.standard_price = vals.standard_price;
    if (vals.default_code !== undefined) safe.default_code = vals.default_code;
    if (vals.barcode !== undefined) safe.barcode = vals.barcode;
    if (vals.image_1920 !== undefined) safe.image_1920 = vals.image_1920;
    if (vals.description_sale !== undefined) safe.description_sale = vals.description_sale;
    try {
      await callWrite(safe);
      partial = true;
    } catch (err2) {
      console.error('updateProductOdoo safe write also failed:', err2?.payload || err2?.message);
      return { error: err2?.payload || { message: err2?.message || 'Save failed' } };
    }
  }

  // On-hand qty change via stock.change.product.qty wizard
  if (onHandQty !== undefined && onHandQty !== '' && onHandQty !== null) {
    try {
      const wizardResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.change.product.qty',
          method: 'create',
          args: [{ product_id: productId, new_quantity: Number(onHandQty) }],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const wizId = wizardResp.data?.result;
      if (wizId) {
        await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: { model: 'stock.change.product.qty', method: 'change_product_qty', args: [[wizId]], kwargs: {} },
        }, { headers: { 'Content-Type': 'application/json' } });
      }
    } catch (qtyErr) {
      console.warn('updateProductOdoo on-hand qty step failed:', qtyErr?.payload || qtyErr?.message);
    }
  }

  return { result: productId, partial };
};

// ─── Stock / inventory helpers ──────────────────────────────────────────────
// fetch list of products with on-hand qty, supports filter by stock state.
export const fetchStockProductsOdoo = async ({ offset = 0, limit = 50, searchText = '', filter = 'all' } = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [];

  if (searchText && searchText.trim() !== '') {
    const term = searchText.trim();
    domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
  }
  if (filter === 'in_stock') {
    domain = domain.concat([['qty_available', '>', 0]]);
  } else if (filter === 'low_stock') {
    domain = domain.concat([['qty_available', '>', 0], ['qty_available', '<=', 5]]);
  } else if (filter === 'out_of_stock') {
    domain = domain.concat([['qty_available', '<=', 0]]);
  }

  const callRead = async (fields) => {
    const response = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.product',
        method: 'search_read',
        args: [domain],
        kwargs: { fields, offset, limit, order: 'name asc' },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    return response.data.result || [];
  };

  // `product_tmpl_id` is requested so the Stock screen can dedupe variants
  // of the same template (a t-shirt with size S/M/L should render as one
  // row in the stock list, matching Odoo's Inventory → Stock view which
  // groups by product, not variant).
  const richFields = ['id', 'name', 'default_code', 'list_price', 'qty_available', 'virtual_available', 'uom_id', 'image_128', 'categ_id', 'product_tmpl_id'];
  const safeFields = ['id', 'name', 'default_code', 'qty_available', 'product_tmpl_id'];

  let raw = [];
  try {
    raw = await callRead(richFields);
  } catch (err) {
    console.warn('fetchStockProductsOdoo rich fetch failed, falling back:', err?.payload || err?.message);
    try {
      raw = await callRead(safeFields);
    } catch (err2) {
      console.error('fetchStockProductsOdoo safe fetch also failed:', err2?.payload || err2?.message);
      throw err2;
    }
  }

  return raw.map((p) => ({
    id: p.id,
    name: p.name || '',
    default_code: p.default_code || '',
    list_price: Number(p.list_price) || 0,
    qty_available: Number(p.qty_available) || 0,
    virtual_available: typeof p.virtual_available === 'undefined' ? null : Number(p.virtual_available),
    uom: Array.isArray(p.uom_id) ? { id: p.uom_id[0], name: p.uom_id[1] } : null,
    category: Array.isArray(p.categ_id) ? { id: p.categ_id[0], name: p.categ_id[1] } : null,
    // Carry the template id through so the screen can dedupe variants.
    product_tmpl_id: p.product_tmpl_id || null,
    image_url: `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`,
  }));
};

// Detail for a single product: product info + per-location quants + last move.
export const fetchProductStockDetailOdoo = async (productId) => {
  if (!productId) return null;
  const baseUrl = getOdooUrl();

  const productResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'product.product',
      method: 'search_read',
      args: [[['id', '=', productId]]],
      kwargs: {
        fields: ['id', 'name', 'default_code', 'list_price', 'qty_available', 'virtual_available', 'uom_id', 'image_128', 'categ_id'],
        limit: 1,
      },
    },
  }, { headers: { 'Content-Type': 'application/json' } });
  if (productResp.data && productResp.data.error) {
    return { error: productResp.data.error };
  }
  const p = (productResp.data.result || [])[0];
  if (!p) return null;

  const product = {
    id: p.id,
    name: p.name || '',
    default_code: p.default_code || '',
    list_price: Number(p.list_price) || 0,
    qty_available: Number(p.qty_available) || 0,
    virtual_available: typeof p.virtual_available === 'undefined' ? null : Number(p.virtual_available),
    uom: Array.isArray(p.uom_id) ? { id: p.uom_id[0], name: p.uom_id[1] } : null,
    category: Array.isArray(p.categ_id) ? { id: p.categ_id[0], name: p.categ_id[1] } : null,
    image_url: `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`,
  };

  // Quants by location
  let quants = [];
  try {
    const quantResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'stock.quant',
        method: 'search_read',
        args: [[['product_id', '=', productId]]],
        kwargs: {
          fields: ['id', 'location_id', 'quantity', 'reserved_quantity'],
          order: 'location_id',
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (!(quantResp.data && quantResp.data.error)) {
      quants = (quantResp.data.result || []).map((q) => ({
        id: q.id,
        location: Array.isArray(q.location_id) ? { id: q.location_id[0], name: q.location_id[1] } : null,
        quantity: Number(q.quantity) || 0,
        reserved: Number(q.reserved_quantity) || 0,
        available: (Number(q.quantity) || 0) - (Number(q.reserved_quantity) || 0),
      }));
    }
  } catch (e) {
    console.warn('fetchProductStockDetailOdoo quants fetch failed:', e?.payload || e?.message);
  }

  // Last completed move (best-effort)
  let lastMove = null;
  try {
    const moveResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'stock.move.line',
        method: 'search_read',
        args: [[['product_id', '=', productId], ['state', '=', 'done']]],
        kwargs: {
          fields: ['id', 'date', 'qty_done', 'quantity', 'location_id', 'location_dest_id'],
          order: 'date desc',
          limit: 1,
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (!(moveResp.data && moveResp.data.error)) {
      const m = (moveResp.data.result || [])[0];
      if (m) {
        lastMove = {
          id: m.id,
          date: m.date || null,
          qty: Number(m.qty_done ?? m.quantity ?? 0) || 0,
          from: Array.isArray(m.location_id) ? { id: m.location_id[0], name: m.location_id[1] } : null,
          to: Array.isArray(m.location_dest_id) ? { id: m.location_dest_id[0], name: m.location_dest_id[1] } : null,
        };
      }
    }
  } catch (e) {
    console.warn('fetchProductStockDetailOdoo last-move fetch failed:', e?.payload || e?.message);
  }

  return { product, quants, lastMove };
};

// Ensure this points to your Odoo URL

// Fetch API token(s) and basic user info for an Odoo user id
export const fetchUserApiToken = async (uid) => {
  // The Odoo instance used by this project may not expose API key models.
  // Authentication will rely on basic `res.users` data returned by the login call.
  // Keep this function for backward compatibility but do not call server models.
  try {
    return {};
  } catch (error) {
    console.error('fetchUserApiToken error (no-op):', error);
    return {};
  }
};

// Fetch categories directly from Odoo using JSON-RPC
// NOTE: older code filtered by a non-existent `is_category` field which caused Odoo to raise
// "Invalid field product.category.is_category". Use a safe domain (empty) and apply
// `name ilike` only when a searchText is provided.
export const fetchCategoriesOdoo = async ({ offset = 0, limit = 50, searchText = "" } = {}) => {
  try {
    // Default to no domain (fetch categories). If you want only top-level categories,
    // you can use `['parent_id', '=', false]` instead.
    let domain = [];

    // If a search term is provided, filter by category name
    if (searchText && searchText.trim() !== "") {
      const term = searchText.trim();
      domain = [["name", "ilike", term]]; // Filter by category name
    }

    // API call to Odoo to fetch the categories
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`, // Odoo API URL
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "product.category", // Odoo model for categories
          method: "search_read",
          args: [domain], // Domain filter for categories
          kwargs: {
            fields: ["id", "name"], // Fields you want to fetch from Odoo
            offset, // Pagination
            limit, // Pagination
            order: "name asc", // Sorting
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    // Handle any errors from the Odoo API
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (categories):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    // Map the categories into a usable format
    const categories = response.data.result || [];
    return categories.map(category => ({
      _id: category.id,
      name: category.name || "",
      // keep backward-compatible key expected by CategoryList
      category_name: category.name || "",
    }));
  } catch (error) {
    console.error("Error fetching categories from Odoo:", error);
    throw error; // Ensure errors are thrown to be caught by the calling function
  }
};

// Fetch detailed product information for a single Odoo product id
export const fetchProductDetailsOdoo = async (productId) => {
  try {
    if (!productId) return null;

    // 1. Fetch product details — try a rich field set first, fall back to a
    // safe core set if any field is rejected by this Odoo db (some builds
    // don't have `available_in_pos`, `pos_categ_ids`, etc.).
    const callRead = async (fields) => {
      const resp = await axios.post(
        `${getOdooUrl()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'product.product',
            method: 'search_read',
            args: [[['id', '=', productId]]],
            kwargs: { fields, limit: 1 },
          },
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (resp.data && resp.data.error) {
        const e = new Error('Odoo JSON-RPC error');
        e.payload = resp.data.error;
        throw e;
      }
      return resp.data.result || [];
    };

    const richFields = [
      'id', 'name', 'list_price', 'standard_price', 'default_code', 'barcode',
      'uom_id', 'image_128', 'description_sale', 'categ_id', 'pos_categ_ids',
      'available_in_pos',
      'qty_available', 'virtual_available',
    ];
    const safeFields = [
      'id', 'name', 'list_price', 'default_code',
      'uom_id', 'image_128', 'categ_id', 'qty_available',
    ];

    let productResults;
    try {
      productResults = await callRead(richFields);
    } catch (err) {
      console.warn(
        'fetchProductDetailsOdoo rich fetch failed, retrying with safe fields:',
        err?.payload?.data?.message || err?.payload?.message || err?.message
      );
      productResults = await callRead(safeFields);
    }
    const productResponse = { data: { result: productResults } };
    const results = productResponse.data.result || [];
    const p = results[0];
    if (!p) return null;

    // 2. Fetch warehouse/stock info
    const quantResponse = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'search_read',
          args: [[['product_id', '=', productId]]],
          kwargs: {
            fields: ['location_id', 'quantity'],
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    let inventory_ledgers = [];
    if (quantResponse.data && quantResponse.data.result) {
      inventory_ledgers = quantResponse.data.result.map(q => ({
        warehouse_id: Array.isArray(q.location_id) ? q.location_id[0] : null,
        warehouse_name: Array.isArray(q.location_id) ? q.location_id[1] : '',
        total_warehouse_quantity: q.quantity,
      }));
    }

    // 3. Shape and return — use inline base64 from the authenticated JSON-RPC
    // response. If the product has no image we leave image_url empty so the
    // detail page shows the "No Image" placeholder instead of a broken URL.
    const hasBase64 = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0;
    const imageUrl = hasBase64 ? `data:image/png;base64,${p.image_128}` : '';

    // Resolve pos.category id → name (search_read of pos_categ_ids returns
    // just an array of ids). Best-effort; ignored on failure.
    let pos_category = null;
    if (Array.isArray(p.pos_categ_ids) && p.pos_categ_ids.length > 0) {
      try {
        const posResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'pos.category',
            method: 'name_get',
            args: [p.pos_categ_ids],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        if (posResp.data && Array.isArray(posResp.data.result) && posResp.data.result[0]) {
          const [pid, pname] = posResp.data.result[0];
          pos_category = { id: pid, name: pname };
        }
      } catch (_) {}
    }

    return {
      id: p.id,
      product_name: p.name || '',
      image_url: imageUrl,
      price: p.list_price || 0,
      sale_price: p.list_price || 0,
      cost: Number(p.standard_price) || 0,
      barcode: p.barcode || '',
      minimal_sales_price: p.list_price || null,
      inventory_ledgers,
      total_product_quantity: p.qty_available ?? p.virtual_available ?? 0,
      inventory_box_products_details: [],
      product_code: p.default_code || null,
      uom: p.uom_id ? { uom_id: p.uom_id[0], uom_name: p.uom_id[1] } : null,
      categ_id: p.categ_id || null,
      pos_category,
      available_in_pos: !!p.available_in_pos,
      product_description: p.description_sale || null,
    };
  } catch (error) {
    console.error('fetchProductDetailsOdoo error:', error);
    throw error;
  }
};


export const fetchInventoryBoxRequest = async ({ offset, limit, searchText }) => {
  const currentUser = useAuthStore.getState().user; // Correct usage of useAuthStore
  const salesPersonId = currentUser.related_profile._id;

  // Debugging output for salesPersonId
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
      ...(salesPersonId !== undefined && { sales_person_id: salesPersonId })
    };
    const response = await get(API_ENDPOINTS.VIEW_INVENTORY_BOX_REQUEST, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchAuditing = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_AUDITING, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchCustomers = async ({ offset, limit, searchText }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_CUSTOMERS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};// 🔹 Fetch customers directly from Odoo 19 via JSON-RPC (no mobile field)
export const fetchCustomersOdoo = async ({ offset = 0, limit = 50, searchText } = {}) => {
  try {
    // 🔍 Domain for search (optional)
    let domain = [];

    if (searchText && searchText.trim() !== "") {
      const term = searchText.trim();
      domain = [
        "|",
        ["name", "ilike", term],
        ["phone", "ilike", term],
      ];
    }
const response = await axios.post(
  `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.partner",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id", "name", "email", "phone",
              "street", "street2", "city", "zip", "country_id"
            ],
            offset,
            limit,
            order: "name asc",
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.data.error) {
      console.log("Odoo JSON-RPC error:", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    const partners = response.data.result || [];

    // 🔙 Shape result for your CustomerScreen
    const baseUrl = getOdooUrl();
    return partners.map((p) => ({
      id: p.id,
      name: p.name || "",
      email: p.email || "",
      phone: p.phone || "",
      image_url: `${baseUrl}/web/image?model=res.partner&id=${p.id}&field=image_128`,
      address: [
        p.street,
        p.street2,
        p.city,
        p.zip,
        p.country_id && Array.isArray(p.country_id) ? p.country_id[1] : ""
      ].filter(Boolean).join(", "),
    }));
  } catch (error) {
    console.error("fetchCustomersOdoo error:", error);
    throw error;
  }
};


export const fetchPickup = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PICKUP, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchService = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_SERVICE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchSpareParts = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_SPARE_PARTS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchMarketStudy = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_MARKET_STUDY, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchCustomerVisitList = async ({ offset, limit, fromDate, toDate, customerId, customerName, employeeName, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
      ...(customerName !== undefined && { customer_name: customerName }),
      ...(customerId !== undefined && { customer_id: customerId }),
      ...(employeeName !== undefined && { employee_name: employeeName }),
      ...(fromDate !== undefined && { from_date: fromDate }),
      ...(toDate !== undefined && { to_date: toDate }),
    };
    const response = await get(API_ENDPOINTS.VIEW_CUSTOMER_VISIT_LIST, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchEnquiryRegister = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_ENQUIRY_REGISTER, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchPurchaseRequisition = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PURCHASE_REQUISITION,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPriceEnquiry = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PRICE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPurchaseOrder = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PURCHASE_ORDER,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchDeliveryNote = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_DELIVERY_NOTE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchVendorBill = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VENDOR_BILL,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPaymentMade = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PAYMENT_MADE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

// viewPaymentMade

export const fetchLead = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
      // ...(sequenceNo !== undefined && { sequence_no: sequenceNo }),
    };
    const response = await get(API_ENDPOINTS.VIEW_LEAD, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchPipeline = async ({ offset, limit, date, source, opportunity, customer, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(date !== undefined && { date: date }),
      ...(source !== undefined && { source_name: source }),
      ...(opportunity !== undefined && { opportunity_name: opportunity }),
      ...(customer !== undefined && { customer_name: customer }),
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PIPELINE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchVisitPlan = async ({ offset, limit, date, employeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      date: date,
      ...(employeeId !== undefined && { employee_id: employeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VISIT_PLAN, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchBoxInspectionReport = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_BOX_INSPECTION_REPORT, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchAttendance = async ({ userId, date }) => {
  try {
    const queryParams = {
      user_id: userId,
      date,
    };
    const response = await get(API_ENDPOINTS.VIEW_ATTENDANCE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchKPIDashboard = async ({ userId }) => {
  try {
    const queryParams = { login_employee_id: userId };
    const response = await get(API_ENDPOINTS.VIEW_KPI, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

export const fetchVehicles = async ({ offset, limit, searchText }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VEHICLES, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Fetch full customer/partner details (address fields) by id from Odoo
export const fetchCustomerDetailsOdoo = async (partnerId) => {
  if (!partnerId) return null;
  const baseUrl = getOdooUrl();

  // Try the rich field set first; if Odoo rejects any field name, fall back to a
  // minimal safe set so the screen always renders something.
  const richFields = [
    'id', 'name', 'email', 'phone',
    'is_company', 'company_name',
    'street', 'street2', 'city', 'zip',
    'state_id', 'country_id',
    'vat', 'website', 'function',
    'category_id',
  ];
  const safeFields = ['id', 'name', 'street', 'street2', 'city', 'zip', 'country_id'];

  const callRead = async (fields) => {
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.partner',
          method: 'search_read',
          args: [[['id', '=', partnerId]]],
          kwargs: { fields, limit: 1 },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    const results = response.data.result || [];
    return results[0] || null;
  };

  let p = null;
  try {
    p = await callRead(richFields);
  } catch (err) {
    console.warn('fetchCustomerDetailsOdoo rich fetch failed, falling back:', err?.payload || err?.message);
    try {
      p = await callRead(safeFields);
    } catch (err2) {
      console.error('fetchCustomerDetailsOdoo safe fetch also failed:', err2?.payload || err2?.message);
      throw err2;
    }
  }
  if (!p) return null;

  // Fetch tag (category) labels via name_get if we received only ids.
  let categories = [];
  if (Array.isArray(p.category_id) && p.category_id.length > 0) {
    try {
      const tagResp = await axios.post(
        `${baseUrl}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'res.partner.category',
            method: 'name_get',
            args: [p.category_id],
            kwargs: {},
          },
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (tagResp.data && !tagResp.data.error && Array.isArray(tagResp.data.result)) {
        categories = tagResp.data.result.map(([id, name]) => ({ id, name }));
      }
    } catch (e) {
      // ignore — tags are optional
    }
  }

  const m2oName = (v) => (Array.isArray(v) && v.length > 1 ? v[1] : '');

  const address = [
    p.street, p.street2, p.city, p.zip, m2oName(p.country_id),
  ].filter(Boolean).join(', ');

  return {
    id: p.id,
    name: p.name || '',
    email: p.email || '',
    phone: p.phone || '',
    image_url: `${baseUrl}/web/image?model=res.partner&id=${p.id}&field=image_128`,
    is_company: !!p.is_company,
    company_name: p.company_name || '',
    street: p.street || '',
    street2: p.street2 || '',
    city: p.city || '',
    zip: p.zip || '',
    state_id: Array.isArray(p.state_id) ? { id: p.state_id[0], name: p.state_id[1] } : null,
    country_id: Array.isArray(p.country_id) ? { id: p.country_id[0], name: p.country_id[1] } : null,
    vat: p.vat || '',
    website: p.website || '',
    function: p.function || '',
    categories,
    address: address || null,
  };
};

// Create a new res.partner. Same fallback strategy as updatePartnerOdoo —
// if Odoo rejects a field name, retries with the safe core set.
export const createPartnerOdoo = async (values) => {
  const baseUrl = getOdooUrl();

  const callCreate = async (vals) => {
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.partner',
          method: 'create',
          args: [vals],
          kwargs: {},
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    return response.data.result;
  };

  try {
    const result = await callCreate(values);
    return { result };
  } catch (err) {
    console.warn('createPartnerOdoo full create failed, retrying with safe fields:', err?.payload || err?.message);
    const safe = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      street: values.street,
      street2: values.street2,
      city: values.city,
      zip: values.zip,
    };
    Object.keys(safe).forEach((k) => safe[k] === undefined && delete safe[k]);
    try {
      const result = await callCreate(safe);
      return { result, partial: true };
    } catch (err2) {
      console.error('createPartnerOdoo safe create also failed:', err2?.payload || err2?.message);
      return { error: err2?.payload || { message: err2?.message || 'Save failed' } };
    }
  }
};

// Write back to res.partner. Tries the full payload first; if Odoo rejects an
// unknown field, retries with only the safe core set so the user still gets
// most of their edits saved.
export const updatePartnerOdoo = async (partnerId, values) => {
  if (!partnerId) return { error: { message: 'partnerId is required' } };
  const baseUrl = getOdooUrl();

  const callWrite = async (vals) => {
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.partner',
          method: 'write',
          args: [[partnerId], vals],
          kwargs: {},
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    return response.data.result;
  };

  try {
    const result = await callWrite(values);
    return { result };
  } catch (err) {
    console.warn('updatePartnerOdoo full write failed, retrying with safe fields:', err?.payload || err?.message);
    const safe = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      street: values.street,
      street2: values.street2,
      city: values.city,
      zip: values.zip,
    };
    Object.keys(safe).forEach((k) => safe[k] === undefined && delete safe[k]);
    try {
      const result = await callWrite(safe);
      return { result, partial: true };
    } catch (err2) {
      console.error('updatePartnerOdoo safe write also failed:', err2?.payload || err2?.message);
      return { error: err2?.payload || { message: err2?.message || 'Save failed' } };
    }
  }
};

// Create Account Payment for Odoo
export const createAccountPaymentOdoo = async ({ partnerId, journalId, amount, invoiceId = null } = {}) => {
  try {
    const params = {
      partner_id: partnerId,
      journal_id: journalId,
      amount,
      payment_type: 'inbound', // Customer payment
      partner_type: 'customer', // Payment from a customer
    };

    // Include invoice_ids to link the payment to the invoice
    if (invoiceId) {
      params.invoice_ids = [[6, 0, [invoiceId]]];
    }

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.payment',
        method: 'create',
        args: [params],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    console.log('[PAYMENT] Creating payment with payload:', payload);

    const response = await fetch(`${getOdooUrl()}/web/dataset/call_kw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[PAYMENT] Payment creation response:', result);

    // Post the payment to finalize it
    if (result.result) {
      const paymentId = result.result;
      await fetch(`${getOdooUrl()}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.payment',
            method: 'action_post',
            args: [[paymentId]],
            kwargs: {},
          },
          id: new Date().getTime(),
        }),
      });
      console.log('[PAYMENT] Payment posted successfully.');
    }

    return result;
  } catch (error) {
    console.error('[PAYMENT] Error creating payment:', error);
    return { error };
  }
};

// Fetch Payment Journals for Odoo
export const fetchPaymentJournalsOdoo = async () => {
  try {
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "account.journal",
          method: "search_read",
          args: [[]],
          kwargs: {
            fields: ["id", "name", "type"],
            limit: 20,
          },
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data && response.data.result) return response.data.result;
    return [];
  } catch (error) {
    console.error("fetchPaymentJournalsOdoo error:", error);
    return [];
  }
};

// Create invoice (account.move) in Odoo
export const createInvoiceOdoo = async ({ partnerId, products = [], journalId = null, invoiceDate = null, reference = '' } = {}) => {
  try {
    if (!partnerId) throw new Error('partnerId is required');

    // Ensure we have a valid journal_id. If a journalId was provided, validate it is a sales journal.
    let finalJournalId = journalId;

    // Helper: fetch a specific journal by id and return its record
    const fetchJournalById = async (jid) => {
      try {
        const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.journal',
            method: 'search_read',
            args: [[['id', '=', jid]]],
            kwargs: { fields: ['id', 'name', 'type', 'code'], limit: 1 },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        return resp.data && resp.data.result && resp.data.result[0];
      } catch (e) {
        console.warn('[INVOICE] Failed to fetch journal by id', jid, e?.message || e);
        return null;
      }
    };

    // If a journalId was supplied, ensure it's of type 'sale'. If not, fall back to finding a sale journal.
    if (finalJournalId) {
      try {
        const provided = await fetchJournalById(finalJournalId);
        if (provided && provided.type !== 'sale') {
          console.warn(`[INVOICE] Provided journal ${finalJournalId} is not a sale journal (type=${provided.type}), ignoring it and trying to auto-select a sale journal`);
          finalJournalId = null;
        } else if (provided) {
          console.log('[INVOICE] Using provided journal:', provided);
          // keep finalJournalId
        }
      } catch (e) {
        console.warn('[INVOICE] Could not validate provided journal:', e);
        finalJournalId = null;
      }
    }

    // When we still don't have a sales journal, try to auto-select one
    if (!finalJournalId) {
      try {
        // First try the existing helper which returns payment journals
        const journals = await fetchPaymentJournalsOdoo();
        console.log('[INVOICE] Fetched journals from Odoo:', JSON.stringify(journals));
        // Prefer explicit type 'sale' or names/codes indicating sales/invoice
        let salesJournal = journals.find(j => j.type === 'sale');
        if (!salesJournal) {
          salesJournal = journals.find(j => /sale|sales|invoice/i.test(String(j.name || j.code || '')));
        }
        if (salesJournal) {
          finalJournalId = salesJournal.id;
          console.log('[INVOICE] Auto-selected sales journal from payment list:', salesJournal);
        } else {
          // Fallback: explicitly query account.journal for type='sale'
          try {
            const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
              jsonrpc: '2.0',
              method: 'call',
              params: {
                model: 'account.journal',
                method: 'search_read',
                args: [[['type', '=', 'sale']]],
                kwargs: { fields: ['id', 'name', 'type', 'code'], limit: 5 },
              },
            }, { headers: { 'Content-Type': 'application/json' } });
            const found = resp.data && resp.data.result || [];
            if (found.length > 0) {
              finalJournalId = found[0].id;
              console.log('[INVOICE] Auto-selected sales journal via explicit account.journal search:', found[0]);
            } else {
              console.error('[INVOICE] No sale journal found in Odoo. Cannot create invoice without a sales journal.');
              throw new Error('No sale journal found in Odoo. Please configure at least one sales journal or pass a valid sales journal id to createInvoiceOdoo.');
            }
          } catch (fallbackErr) {
            console.error('[INVOICE] Fallback search for sale journal failed:', fallbackErr);
            throw fallbackErr;
          }
        }
      } catch (err) {
        console.warn('[INVOICE] Failed to auto-select sales journal:', err);
        // rethrow to let the caller handle this as a fatal configuration issue
        throw err;
      }
    }

    // Build invoice lines and log each line's tax/price
    let totalUntaxed = 0;
    let totalTax = 0;
    const invoice_lines = products.map((p) => {
      const price_unit = p.price || p.price_unit || p.list_price || 0;
      const quantity = p.quantity || p.qty || 1;
      // Resolve a numeric Odoo product id if available; accept common aliases
      let resolvedProductId = p.product_odoo_id ?? p.product_id ?? p.id;
      if (typeof resolvedProductId === 'string') {
        // If purely numeric string, convert to number
        if (/^\d+$/.test(resolvedProductId)) {
          resolvedProductId = Number(resolvedProductId);
        } else {
          // Try to extract first numeric sequence (best-effort)
          const m = String(resolvedProductId).match(/(\d+)/);
          if (m) {
            resolvedProductId = Number(m[1]);
            console.warn(`[INVOICE LINE] Parsed numeric id ${resolvedProductId} from string id '${p.id}'`);
          } else {
            // Not a numeric id - omit product_id to avoid Odoo integer errors
            resolvedProductId = null;
          }
        }
      }

      // Get discount percentage from product
      const discount_pct = Number(p.discount || p.discount_percent || 0);

      const vals = {
        name: p.name || p.product_name || '',
        quantity,
        price_unit,
        discount: discount_pct, // Include discount percentage on invoice line
      };

      if (Number.isInteger(resolvedProductId)) {
        vals.product_id = resolvedProductId;
      } else {
        console.warn(`[INVOICE LINE] Skipping product_id for product '${p.name || p.product_name || ''}' (id: ${String(p.id)}) - not a numeric Odoo id`);
      }

      // taxes: if provided as array of ids
      if (p.tax_ids && Array.isArray(p.tax_ids) && p.tax_ids.length) {
        vals.tax_ids = [[6, 0, p.tax_ids]];
        // For diagnosis, log tax_ids
        console.log(`[INVOICE LINE] Product ${p.id} tax_ids:`, p.tax_ids);
      }
      // For diagnosis, log price, quantity, discount and resolved id
      const lineSubtotal = price_unit * quantity * (1 - discount_pct / 100);
      console.log(`[INVOICE LINE] Product ${p.id} price_unit:`, price_unit, 'quantity:', quantity, 'discount:', discount_pct + '%', 'line_subtotal:', lineSubtotal, 'resolved_product_id:', vals.product_id || 'none');
      totalUntaxed += lineSubtotal;
      // Note: Odoo will compute tax, but log if tax_ids present
      if (p.tax_ids && Array.isArray(p.tax_ids) && p.tax_ids.length) {
        // This is a placeholder; actual tax calculation is done by Odoo
        totalTax += 0; // You may add your own calculation if needed
      }
      return [0, 0, vals];
    });

    // Include journal_id only if we have a valid id (avoid sending null)
    const moveVals = {
      partner_id: partnerId,
      move_type: 'out_invoice',
      invoice_line_ids: invoice_lines,
    };
    if (finalJournalId) moveVals.journal_id = finalJournalId;
    if (invoiceDate) moveVals.invoice_date = invoiceDate;
    if (reference) moveVals.ref = reference;

    // Log computed totals before sending
    console.log('[INVOICE] Computed untaxed total:', totalUntaxed);
    console.log('[INVOICE] Computed tax (placeholder, Odoo computes):', totalTax);
    console.log('[STEP 2] Invoice Payload:', moveVals);

    // Create the account.move record
    const createResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'create',
        args: [moveVals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    console.log('[STEP 2] Invoice Creation Response:', createResp.data);
    if (createResp.data && createResp.data.error) {
      console.error('[INVOICE] Odoo error response:', createResp.data.error);
    }
    const createdId = createResp.data && createResp.data.result;
    // Fetch and log the created move record and its lines for diagnosis
    if (createdId) {
      try {
        const moveResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'search_read',
            args: [[['id', '=', createdId]]],
            kwargs: { fields: ['id', 'state', 'move_type', 'journal_id', 'invoice_date', 'payment_state', 'amount_total', 'amount_residual', 'company_id', 'partner_id', 'invoice_line_ids'] },
          },
          id: new Date().getTime(),
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('[INVOICE DIAG] Created move (search_read):', moveResp.data);
      } catch (moveFetchErr) {
        console.warn('[INVOICE DIAG] Failed to fetch created move:', moveFetchErr);
      }
      try {
        const linesResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move.line',
            method: 'search_read',
            args: [[['move_id', '=', createdId]]],
            kwargs: { fields: ['id', 'move_id', 'product_id', 'name', 'quantity', 'price_unit', 'account_id', 'tax_ids'] },
          },
          id: new Date().getTime(),
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('[INVOICE DIAG] Created move lines (search_read):', linesResp.data);
      } catch (linesFetchErr) {
        console.warn('[INVOICE DIAG] Failed to fetch created move lines:', linesFetchErr);
      }
    }
    // Post the invoice immediately after creation
    let posted = false;
    if (createdId) {
      try {
        console.log(`📮 Posting invoice ${createdId}...`);
        const postResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'action_post',
            args: [[createdId]],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        
        if (postResp.data && postResp.data.error) {
          console.error('[INVOICE POST] Error posting invoice:', postResp.data.error);
        } else {
          posted = true;
          console.log('✅ Invoice posted successfully');
        }
      } catch (postErr) {
        console.error('[INVOICE POST] Failed to post invoice:', postErr);
      }
    }
    
    // Fetch final invoice status (payment_state, state, amount_residual, amount_total) for diagnostics
    let invoiceStatus = null;
    if (createdId) {
      try {
        const statusResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'search_read',
            args: [[['id', '=', createdId]]],
            kwargs: { fields: ['id', 'state', 'move_type', 'payment_state', 'amount_residual', 'amount_total', 'invoice_date'] },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        invoiceStatus = statusResp.data && statusResp.data.result && statusResp.data.result[0];
        console.log(`[INVOICE STATUS] fetched for invoice id (${createdId}) :`, invoiceStatus);
      } catch (statusErr) {
        console.warn('[INVOICE STATUS] Failed to fetch invoice status:', statusErr);
      }
    }

    return { id: createdId, posted, invoiceStatus };
  } catch (error) {
    console.error('createInvoiceOdoo error:', error);
    throw error;
  }
};

// Link an account.move (invoice) to a pos.order and optionally set its state to a specific value
export const linkInvoiceToPosOrderOdoo = async ({ orderId, invoiceId, setState = true, state = null } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!invoiceId) throw new Error('invoiceId is required');

    // Only link the invoice, do not change the order state
    const vals = { account_move: invoiceId };

    console.log('[POS LINK] Linking invoice to POS order:', { orderId, invoiceId, vals });

    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    console.log('[POS LINK] write response:', resp.data);

    // Verify update by reading the order
    try {
      const verify = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.order',
          method: 'search_read',
          args: [[['id', '=', orderId]]],
          kwargs: { fields: ['id', 'state', 'account_move'] },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      console.log('[POS LINK] verify response:', verify.data);
    } catch (verifyErr) {
      console.warn('[POS LINK] verify read failed:', verifyErr);
    }

    return resp.data;
  } catch (error) {
    console.error('linkInvoiceToPosOrderOdoo error:', error);
    return { error };
  }
};

// Create POS order in Odoo via JSON-RPC
export const createPosOrderOdoo = async ({ partnerId = null, lines = [], sessionId = null, posConfigId = null, companyId = null, orderName = null, preset_id = null, amount_total: override_amount_total = null, discount = 0 } = {}) => {
  try {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new Error('lines are required to create pos order');
    }

    // Build lines entries for Odoo POS order
    const line_items = lines.map(l => {
      const price_unit = l.price || l.price_unit || l.list_price || 0;
      const qty = l.qty || l.quantity || 1;
      // prefer client-provided subtotal (already discounted) if present
      const subtotal = (typeof l.price_subtotal !== 'undefined' && l.price_subtotal !== null) ? Number(l.price_subtotal) : (price_unit * qty);
      const discount_pct = Number(l.discount || l.discount_percent || 0);
      return [0, 0, {
        product_id: l.product_id || l.id,
        qty,
        price_unit,
        name: l.name || l.product_name || '',
        discount: discount_pct,
        price_subtotal: subtotal,
        price_subtotal_incl: subtotal,
      }];
    });

    // Calculate total (allow override when discount applied by client)
    const calculated_total = lines.reduce((sum, l) => sum + (l.price || l.price_unit || l.list_price || 0) * (l.qty || l.quantity || 1), 0);
    const amount_total = (override_amount_total !== null && override_amount_total !== undefined) ? Number(override_amount_total) : calculated_total;
    const vals = {
      company_id: companyId || 1, // Default to 1 if not provided
      name: orderName || '/', // Use '/' for auto-generated name if not provided
      partner_id: partnerId || false,
      lines: line_items,
      amount_tax: 0,
      amount_total,
      amount_paid: 0, // Start with 0, will be updated when payment is made
      amount_return: 0,
      state: 'draft', // Start in draft state, will be paid after payment
    };
    // Note: do not set a top-level `discount` on pos.order — not a valid field on the model
    if (sessionId) vals.session_id = sessionId;
    if (posConfigId) vals.config_id = posConfigId;
    if (preset_id !== null && preset_id !== undefined) vals.preset_id = preset_id;

    console.log('📦 Creating POS Order with payload:', JSON.stringify(vals, null, 2));
    console.log('📊 Order summary:', {
      total_items: lines.length,
      amount_total: vals.amount_total,
      partner_id: vals.partner_id,
      session_id: vals.session_id,
      config_id: vals.config_id,
      preset_id: vals.preset_id,
    });

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo create pos.order error:', response.data.error);
      return { error: response.data.error };
    }

    const createdId = response.data.result;
    console.log('✅ POS Order created successfully with ID:', createdId);
    // Don't validate immediately - order will be validated after payment
    return { result: createdId };
  } catch (error) {
    console.error('createPosOrderOdoo error:', error);
    return { error };
  }
};

// Create sale.order in Odoo via JSON-RPC (used by Cart checkout flow)
export const createSaleOrderOdoo = async ({ partnerId = null, lines = [], companyId = null, orderName = null, pricelist_id = null, note = '' } = {}) => {
  try {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new Error('lines are required to create sale order');
    }

    const order_lines = lines.map(l => {
      const qty = Number(l.qty || l.quantity || l.product_uom_qty || 1);
      const price_unit = Number(l.price || l.price_unit || l.list_price || 0);
      return [0, 0, {
        product_id: l.product_id || l.id || false,
        name: l.name || l.product_name || '',
        product_uom_qty: qty,
        price_unit,
      }];
    });

    // attempt to resolve partner/company from auth store if not provided
    try {
      const authUser = useAuthStore.getState().user || {};
      if (!partnerId) {
        const p = authUser.partner_id;
        partnerId = Array.isArray(p) ? p[0] : p || null;
      }
      if (!companyId) {
        const c = authUser.company_id;
        companyId = Array.isArray(c) ? c[0] : c || null;
      }
    } catch (e) {
      /* ignore */
    }

    const vals = {
      partner_id: partnerId || 1,
      company_id: companyId || 1,
      name: orderName || '/',
      order_line: order_lines,
      note: note || '',
    };
    if (pricelist_id) vals.pricelist_id = pricelist_id;

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo create sale.order error:', response.data.error);
      return { error: response.data.error };
    }

    const createdId = response.data.result;
    console.log('✅ Sale Order created successfully with ID:', createdId);
    return { result: createdId };
  } catch (error) {
    console.error('createSaleOrderOdoo error:', error);
    return { error };
  }
};

// Confirm (action_confirm) a sale.order in Odoo via JSON-RPC
export const confirmSaleOrderOdoo = async (orderId, options = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'action_confirm',
        args: [[orderId]],
        kwargs: {},
      },
    };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo confirm sale.order error:', response.data.error);
      return { error: response.data.error };
    }
    console.log(`✅ sale.order ${orderId} confirmed`);
    return { result: response.data.result };
  } catch (error) {
    console.error('confirmSaleOrderOdoo error:', error);
    return { error };
  }
};

// Link an account.move (invoice) to a sale.order by setting invoice_ids
export const linkInvoiceToSaleOrderOdoo = async ({ orderId, invoiceId } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!invoiceId) throw new Error('invoiceId is required');

    const vals = { invoice_ids: [[6, 0, [invoiceId]]] };
    console.log('[SALE LINK] Linking invoice to sale.order:', { orderId, invoiceId, vals });

    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'write',
        args: [[orderId], vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (resp.data && resp.data.error) {
      console.error('linkInvoiceToSaleOrderOdoo error:', resp.data.error);
      return { error: resp.data.error };
    }
    return { result: resp.data.result };
  } catch (error) {
    console.error('linkInvoiceToSaleOrderOdoo error:', error);
    return { error };
  }
};

// Create POS payment(s) in Odoo via JSON-RPC
// Accepts either a single payment or an array of payments
export const createPosPaymentOdoo = async ({ orderId, payments, amount, journalId, paymentMethodId, paymentMode = 'cash', partnerId = null, sessionId = null, companyId = null } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');

    // Support both legacy (amount) and new (payments array) API
    let paymentRecords = [];
    if (Array.isArray(payments) && payments.length > 0) {
      paymentRecords = payments;
    } else if (typeof amount !== 'undefined') {
      paymentRecords = [{ amount: Number(amount), journalId, paymentMethodId, paymentMode }];
    } else {
      throw new Error('No payment(s) provided');
    }

    const results = [];
    for (const payment of paymentRecords) {
      const amt = Number(payment.amount) || 0;
      if (amt === 0) continue; // Skip zero payments

      let finalPaymentMethodId = payment.paymentMethodId || paymentMethodId;
      let finalJournalId = payment.journalId || journalId;
      let finalPaymentMode = payment.paymentMode || paymentMode;

      // If paymentMethodId is not provided, fetch it using journalId
      if (!finalPaymentMethodId) {
        if (!finalJournalId) throw new Error('paymentMethodId or journalId is required');
        const pmResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'pos.payment.method',
            method: 'search_read',
            args: [[['journal_id', '=', finalJournalId]]],
            kwargs: { fields: ['id', 'name', 'journal_id'], limit: 1 },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        finalPaymentMethodId = pmResp.data?.result?.[0]?.id;
        if (!finalPaymentMethodId) {
          console.error('No payment_method_id found for journalId', finalJournalId);
          return { error: { message: 'No payment_method_id found for journalId ' + finalJournalId } };
        }
      }

      const paymentVals = {
        pos_order_id: orderId,
        amount: amt,
        payment_method_id: finalPaymentMethodId,
        partner_id: partnerId || false,
        session_id: sessionId || false,
        company_id: companyId || 1, // Corrected `CompanyId` to `companyId`
      };

      console.log('💳 Creating POS Payment with payload:', JSON.stringify(paymentVals, null, 2));
      console.log('💰 Payment summary:', {
        order_id: paymentVals.pos_order_id,
        amount: paymentVals.amount,
        payment_method_id: paymentVals.payment_method_id,
        payment_mode: finalPaymentMode,
      });

      const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.payment',
          method: 'create',
          args: [paymentVals],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });

      if (response.data && response.data.error) {
        console.error('Odoo create pos.payment error:', response.data.error);
        results.push({ error: response.data.error });
      } else {
        results.push({ result: response.data.result });
      }
    }
    return { results };
  } catch (error) {
    console.error('createPosPaymentOdoo error:', error);
    return { error };
  }
};

// Open a POS session in Odoo. Odoo 19 dropped `open_session_cb`, so we use
// `pos.config.open_ui` (the canonical method since Odoo 15) which creates a
// `pos.session` record for the config if one isn't already open. After it
// returns, we look up the just-opened session id by searching `pos.session`
// for this config in an open state.
export const createPOSSesionOdoo = async ({ configId, userId, openingCash = 0, openingNote = '' }) => {
  const buildPayload = (model, method, args, kwargs = {}) => ({
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs },
    id: new Date().getTime(),
  });

  try {
    if (!configId) throw new Error('configId is required');

    const { getOdooDb } = require('../config/odooConfig');
    const db = getOdooDb();
    const url = `${getOdooUrl()}/web/dataset/call_kw`;
    const headers = {
      'Content-Type': 'application/json',
      ...(db ? { 'X-Odoo-Database': db } : {}),
    };

    const cfgId = Number(configId);
    const openUiPayload = buildPayload('pos.config', 'open_ui', [[cfgId]]);

    console.log('[OPEN POS SESSION] open_ui request', { url, db, configId: cfgId, userId, payload: openUiPayload });

    const openResp = await axios.post(url, openUiPayload, { headers, withCredentials: true });
    console.log('[OPEN POS SESSION] open_ui raw response', openResp?.data);

    if (openResp.data && openResp.data.error) {
      const err = openResp.data.error;
      const detail = err?.data?.message || err?.data?.name || err?.message || 'Odoo server error';
      console.error('[OPEN POS SESSION] open_ui error:', detail, err);
      return { error: { ...err, message: detail } };
    }

    // open_ui returns a client action dict; the session itself isn't in the
    // payload. Look it up by searching for an open session for this config.
    const lookupPayload = buildPayload('pos.session', 'search_read', [
      [['config_id', '=', cfgId], ['state', 'in', ['opening_control', 'opened']]],
    ], { fields: ['id', 'name', 'state', 'user_id'], limit: 1, order: 'id desc' });

    console.log('[OPEN POS SESSION] looking up freshly opened session', lookupPayload);
    const lookupResp = await axios.post(url, lookupPayload, { headers, withCredentials: true });
    console.log('[OPEN POS SESSION] lookup raw response', lookupResp?.data);

    if (lookupResp.data && lookupResp.data.error) {
      const err = lookupResp.data.error;
      const detail = err?.data?.message || err?.data?.name || err?.message || 'Odoo server error';
      console.error('[OPEN POS SESSION] lookup error:', detail, err);
      return { error: { ...err, message: detail } };
    }

    const sessions = lookupResp.data?.result || [];
    let session = sessions[0] || null;
    const sessionId = session?.id || null;

    // Advance opening_control → opened so the session shows up under "Open
    // Registers" (which filters by state='opened'). Odoo 17/18/19 expose
    // `pos.session.set_opening_control(cash_register_balance_start, notes)`
    // as the public method for this. We pass 0 / '' (no opening cash, no
    // note) so the user doesn't have to validate cash control manually.
    if (session && session.state === 'opening_control' && sessionId) {
      const cashAmount = Number(openingCash) || 0;
      const noteText = String(openingNote || '');
      const advancePayload = buildPayload('pos.session', 'set_opening_control', [[sessionId], cashAmount, noteText]);
      console.log('[OPEN POS SESSION] advancing opening_control → opened via set_opening_control', advancePayload);
      try {
        const advanceResp = await axios.post(url, advancePayload, { headers, withCredentials: true });
        console.log('[OPEN POS SESSION] set_opening_control raw response', advanceResp?.data);

        if (advanceResp.data?.error) {
          // Method missing or refused — fall back to a direct write on `state`.
          console.warn('[OPEN POS SESSION] set_opening_control failed, attempting direct write fallback:', advanceResp.data.error?.data?.message || advanceResp.data.error?.message);
          const writePayload = buildPayload('pos.session', 'write', [[sessionId], { state: 'opened', cash_register_balance_start: cashAmount, opening_notes: noteText || false }]);
          console.log('[OPEN POS SESSION] direct write fallback payload', writePayload);
          const writeResp = await axios.post(url, writePayload, { headers, withCredentials: true });
          console.log('[OPEN POS SESSION] direct write raw response', writeResp?.data);
        }

        // Re-read to see the post-advance state.
        const refetchResp = await axios.post(url, lookupPayload, { headers, withCredentials: true });
        const refreshed = refetchResp.data?.result?.[0];
        if (refreshed) {
          console.log('[OPEN POS SESSION] refreshed session after advance:', refreshed);
          session = refreshed;
        }
      } catch (e) {
        console.warn('[OPEN POS SESSION] advance step threw, returning session as-is:', e?.message);
      }
    }

    console.log('[OPEN POS SESSION] success', { sessionId, session });
    return { result: openResp.data?.result, sessionId, session };
  } catch (error) {
    const detail = error?.response?.data?.error?.data?.message
      || error?.response?.data?.error?.message
      || error?.message
      || 'Network error';
    console.error('[OPEN POS SESSION] exception:', detail, error);
    return { error: { message: detail, original: error } };
  }
};

// Fetch restaurant tables from Odoo using JSON-RPC

export const fetchRestaurantTablesOdoo = async () => {
  try {
    // Resolve runtime URL + DB (set by the login screen from what the user entered).
    const { getOdooUrl, getOdooDb } = require('../config/odooConfig');
    const base = getOdooUrl();
    const db = getOdooDb();
    const response = await fetch(`${base}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Odoo-Database': db,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'restaurant.table',
          method: 'search_read',
          args: [[]], // No filter, fetch all tables
          kwargs: { fields: [
            'id', 'table_number', 'display_name', 'floor_id', 'seats', 'shape',
            'position_h', 'position_v', 'width', 'height', 'color', 'active'
          ] }
        },
        id: new Date().getTime(),
      }),
    });
    const rawText = await response.text();
    console.log('[fetchRestaurantTablesOdoo] Response status:', response.status);
    console.log('[fetchRestaurantTablesOdoo] Response headers:', JSON.stringify([...response.headers]));
    console.log('[fetchRestaurantTablesOdoo] Raw response text:', rawText);
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('fetchRestaurantTablesOdoo JSON parse error:', parseErr, 'Raw text:', rawText);
      return { error: parseErr, raw: rawText };
    }
    if (data.error) {
      console.error('Odoo fetchRestaurantTablesOdoo error:', data.error);
      return { error: data.error };
    }
    return { result: data.result };
  } catch (error) {
    console.error('fetchRestaurantTablesOdoo error:', error);
    return { error };
  }
};

// Fetch open POS orders for a given table id
export const fetchOpenOrdersByTable = async (tableId) => {
  try {
    if (!tableId) return { result: [] };
    // Exclude orders that are 'done' or 'cancel' so only active/draft orders are returned
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['table_id', '=', tableId], ['state', 'not in', ['done', 'cancel']]]],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'lines'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo fetchOpenOrdersByTable error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOpenOrdersByTable error:', error);
    return { error };
  }
};

// Create a draft pos.order assigned to a table
export const createDraftPosOrderOdoo = async ({ sessionId, userId, tableId, partnerId = false, note = '', preset_id = 10 } = {}) => {
  try {
    const vals = {
      session_id: sessionId,
      user_id: userId || false,
      partner_id: partnerId || false,
      table_id: tableId || false,
      lines: [],
      internal_note: note,
      amount_tax: 0,
      amount_total: 0,
      amount_paid: 0,
      amount_return: 0,
      state: 'draft',
      preset_id: preset_id,
    };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo createPosOrderOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    // response.data.result is the new record id
    const createdId = response.data.result;
    console.log('[createDraftPosOrderOdoo] Created draft pos.order id:', createdId);
    // Try to fetch the full created order record for logging (non-blocking for callers)
    try {
      const full = await fetchPosOrderById(createdId);
      if (full && full.result) {
        console.log('[createDraftPosOrderOdoo] Created order details:', full.result);
      } else {
        console.log('[createDraftPosOrderOdoo] Could not fetch created order details for id', createdId);
      }
    } catch (fetchErr) {
      console.warn('[createDraftPosOrderOdoo] Failed to fetch created order details:', fetchErr);
    }
    return { result: createdId };
  } catch (error) {
    console.error('createDraftPosOrderOdoo error:', error);
    return { error };
  }
};

// Add a line to an existing pos.order using the correct 'lines' field
export const addLineToOrderOdoo = async ({ orderId, productId, qty = 1, price_unit = 0, name = '', taxes = [] } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!productId) throw new Error('productId is required');

    const lineVals = {
      product_id: productId,
      qty: Number(qty) || 1,
      price_unit: Number(price_unit) || 0,
      name: name || '',
      price_subtotal: (Number(qty) || 1) * (Number(price_unit) || 0),
      price_subtotal_incl: (Number(qty) || 1) * (Number(price_unit) || 0),
    };
    if (Array.isArray(taxes) && taxes.length > 0) {
      lineVals.tax_ids = taxes.map(t => typeof t === 'number' ? t : (t.id || t[0] || null)).filter(Boolean);
    }

    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], { lines: [[0, 0, lineVals]] }],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[addLineToOrderOdoo] RPC payload:', { orderId, lineVals });
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo addLineToOrderOdoo error:', response.data.error);
      return { error: response.data.error };
    }

    return { result: response.data.result };
  } catch (error) {
    console.error('addLineToOrderOdoo error:', error);
    return { error };
  }
};

// Fetch all open POS orders (not done) optionally filtered by session or limit
export const fetchOpenOrders = async ({ sessionId = null, limit = 100 } = {}) => {
  try {
    const domain = [['state', '!=', 'done']];
    if (sessionId) domain.push(['session_id', '=', sessionId]);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'create_date'], limit, order: 'create_date desc' },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo fetchOpenOrders error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOpenOrders error:', error);
    return { error };
  }
};

// Fetch orders without filtering out done orders (flexible fetch)
export const fetchOrders = async ({ sessionId = null, limit = 100, order = 'create_date desc' } = {}) => {
  try {
    const domain = [];
    if (sessionId) domain.push(['session_id', '=', sessionId]);

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'create_date'], limit, order },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchOrders error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOrders error:', error);
    return { error };
  }
};

// Fetch a single pos.order by id (includes `lines` which are line ids)
export const fetchPosOrderById = async (orderId) => {
  try {
    if (!orderId) return { result: null };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['id', '=', orderId]]],
        // include preset_id so clients can read the selected preset on the order
        kwargs: { fields: ['id','name','state','amount_total','table_id','lines','create_date','user_id','partner_id','preset_id'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchPosOrderById error:', response.data.error);
      return { error: response.data.error };
    }
    const result = (response.data.result && response.data.result[0]) || null;
    return { result };
  } catch (error) {
    console.error('fetchPosOrderById error:', error);
    return { error };
  }
};

// Fetch pos.order.line records for given line ids
export const fetchOrderLinesByIds = async (lineIds = []) => {
  try {
    if (!Array.isArray(lineIds) || lineIds.length === 0) return { result: [] };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [[['id', 'in', lineIds]]],
        kwargs: { fields: ['id','product_id','qty','price_unit','price_subtotal','price_subtotal_incl','tax_ids','discount','name'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchOrderLinesByIds error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result || [] };
  } catch (error) {
    console.error('fetchOrderLinesByIds error:', error);
    return { error };
  }
};

// Fetch pos.preset records (POS presets like Dine In / Takeaway)
export const fetchPosPresets = async ({ limit = 200 } = {}) => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.preset',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id','name','available_in_self','use_guest','pricelist_id','color','image_128'], limit, order: 'id asc' },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchPosPresets error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchPosPresets error:', error);
    return { error };
  }
};

// Update an existing pos.order.line (qty, price_unit, name, etc.)
export const updateOrderLineOdoo = async ({ lineId, qty, price_unit, name } = {}) => {
  try {
    if (!lineId) throw new Error('lineId is required');
    const vals = {};
    if (typeof qty !== 'undefined') vals.qty = Number(qty);
    if (typeof price_unit !== 'undefined') vals.price_unit = Number(price_unit);
    if (typeof name !== 'undefined') vals.name = name;

    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'write',
        args: [[lineId], vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[updateOrderLineOdoo] RPC payload:', { lineId, vals });
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo updateOrderLineOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('updateOrderLineOdoo error:', error);
    return { error };
  }
};

// Remove (unlink) a pos.order.line by id
export const removeOrderLineOdoo = async ({ lineId } = {}) => {
  try {
    if (!lineId) throw new Error('lineId is required');
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'unlink',
        args: [[lineId]],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[removeOrderLineOdoo] RPC payload:', { lineId });
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo removeOrderLineOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('removeOrderLineOdoo error:', error);
    return { error };
  }
};

// Fetch selection values for a given model field (e.g., pos.order state selection)
export const fetchFieldSelectionOdoo = async ({ model = '', field = '' } = {}) => {
  try {
    if (!model || !field) throw new Error('model and field are required');
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method: 'fields_get',
        args: [[field]],
        kwargs: { attributes: ['selection'] },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error(`[FIELDS_GET] Odoo error for ${model}.${field}:`, response.data.error);
      return [];
    }

    const fieldDef = response.data && response.data.result && response.data.result[field];
    if (!fieldDef) return [];
    return fieldDef.selection || [];
  } catch (error) {
    console.error('fetchFieldSelectionOdoo error:', error);
    return [];
  }
};

// Fetch base64 product image for a single product id
export const fetchProductImageBase64 = async (productId) => {
  try {
    if (!productId) return null;
    const resp = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'search_read',
          args: [[['id', '=', productId]]],
          kwargs: { fields: ['id', 'image_128'], limit: 1 },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (resp.data && resp.data.result && Array.isArray(resp.data.result) && resp.data.result[0]) {
      return resp.data.result[0].image_128 || null;
    }
    return null;
  } catch (err) {
    console.error('fetchProductImageBase64 error:', err?.message || err);
    return null;
  }
};

// Fetch discount presets from Odoo (attempts common POS discount model)
export const fetchDiscountsOdoo = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name', 'amount', 'is_percentage'], limit: 50 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    const results = response.data?.result || [];
    if (results.length === 0) {
      // If pos.discount not present, return empty — caller may fallback to presets
      console.log('fetchDiscountsOdoo: no pos.discount records found');
    }
    return results;
  } catch (error) {
    console.warn('fetchDiscountsOdoo error:', error?.message || error);
    return [];
  }
};

// Create a discount record in Odoo (pos.discount)
export const createDiscountOdoo = async ({ name, amount = 0, is_percentage = false } = {}) => {
  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'create',
        args: [{ name, amount, is_percentage }],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { id: response.data.result } : { error: 'no_result' };
  } catch (error) {
    console.error('createDiscountOdoo error:', error);
    return { error };
  }
};

// Update a discount record in Odoo
export const updateDiscountOdoo = async ({ id, values = {} } = {}) => {
  try {
    if (!id) throw new Error('id required');
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'write',
        args: [[id], values],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { success: true } : { error: 'no_result' };
  } catch (error) {
    console.error('updateDiscountOdoo error:', error);
    return { error };
  }
};

// Delete a discount record in Odoo
export const deleteDiscountOdoo = async ({ id } = {}) => {
  try {
    if (!id) throw new Error('id required');
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'unlink',
        args: [[id]],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { success: true } : { error: 'no_result' };
  } catch (error) {
    console.error('deleteDiscountOdoo error:', error);
    return { error };
  }
};

// Create a new user in Odoo
export const createUserOdoo = async ({ name, login, password, email = '', phone = '', groups = [] } = {}) => {
  try {
    if (!name) throw new Error('name is required');
    if (!login) throw new Error('login is required');
    if (!password) throw new Error('password is required');

    const userVals = {
      name,
      login,
      password,
      email: email || '',
      phone: phone || '',
    };

    // Add groups if provided (e.g., [1, 2, 3] for group IDs)
    if (Array.isArray(groups) && groups.length > 0) {
      userVals.groups_id = [[6, 0, groups]];
    }

    console.log('[CREATE USER] Creating user with payload:', userVals);

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'create',
        args: [userVals],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[CREATE USER] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const userId = response.data.result;
    console.log('[CREATE USER] User created successfully with ID:', userId);
    return { result: userId };
  } catch (error) {
    console.error('createUserOdoo error:', error);
    return { error };
  }
};

// Fetch users from Odoo
export const fetchUsersOdoo = async ({ offset = 0, limit = 50, searchText = '' } = {}) => {
  try {
    let domain = [];

    if (searchText && searchText.trim() !== '') {
      const term = searchText.trim();
      domain = [
        '|',
        ['name', 'ilike', term],
        ['login', 'ilike', term],
      ];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'login', 'email', 'phone', 'active'],
          offset,
          limit,
          order: 'name asc',
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH USERS] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const users = response.data.result || [];
    console.log('[FETCH USERS] Retrieved users count:', users.length);
    return users;
  } catch (error) {
    console.error('fetchUsersOdoo error:', error);
    throw error;
  }
};

// Fetch POS orders from Odoo
export const fetchOrdersOdoo = async ({ offset = 0, limit = 50, searchText = '' } = {}) => {
  try {
    let domain = [];

    if (searchText && searchText.trim() !== '') {
      const term = searchText.trim();
      domain = [
        '|',
        '|',
        ['name', 'ilike', term],
        ['partner_id', 'ilike', term],
        ['user_id', 'ilike', term],
      ];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: [
            'id', 'name', 'pos_reference',
            'partner_id', 'user_id', 'date_order',
            'amount_total', 'amount_paid', 'state',
            'session_id', 'config_id',
          ],
          offset,
          limit,
          order: 'date_order desc',
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH POS ORDERS] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orders = response.data.result || [];
    console.log('[FETCH POS ORDERS] Retrieved orders count:', orders.length);
    return orders;
  } catch (error) {
    console.error('fetchOrdersOdoo error:', error);
    throw error;
  }
};

// Fetch a single pos.order with its lines (and image_url for each product) so
// we can show a full receipt detail view, or reload a draft order back into
// the cart for editing.
export const fetchPosOrderDetailOdoo = async (orderId) => {
  if (!orderId) return null;
  const baseUrl = getOdooUrl();

  const orderResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'pos.order',
      method: 'search_read',
      args: [[['id', '=', orderId]]],
      kwargs: {
        fields: [
          'id', 'name', 'pos_reference',
          'partner_id', 'user_id', 'date_order',
          'amount_total', 'amount_tax', 'amount_paid', 'amount_return',
          'state', 'session_id', 'config_id', 'lines',
        ],
        limit: 1,
      },
    },
  }, { headers: { 'Content-Type': 'application/json' } });

  if (orderResp.data && orderResp.data.error) {
    console.error('[FETCH POS ORDER DETAIL] error:', orderResp.data.error);
    return { error: orderResp.data.error };
  }
  const order = (orderResp.data.result || [])[0];
  if (!order) return null;

  let lines = [];
  if (Array.isArray(order.lines) && order.lines.length > 0) {
    const linesResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'read',
        args: [order.lines],
        kwargs: {
          fields: ['id', 'product_id', 'qty', 'price_unit', 'discount', 'price_subtotal', 'price_subtotal_incl', 'name'],
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (!(linesResp.data && linesResp.data.error)) {
      lines = (linesResp.data.result || []).map((l) => {
        const pid = Array.isArray(l.product_id) ? l.product_id[0] : null;
        const pname = Array.isArray(l.product_id) ? l.product_id[1] : (l.name || 'Product');
        return {
          id: l.id,
          product_id: pid,
          name: pname,
          qty: Number(l.qty) || 0,
          price_unit: Number(l.price_unit) || 0,
          discount: Number(l.discount) || 0,
          price_subtotal: Number(l.price_subtotal) || 0,
          price_subtotal_incl: Number(l.price_subtotal_incl) || 0,
          image_url: pid ? `${baseUrl}/web/image?model=product.product&id=${pid}&field=image_128` : null,
        };
      });
    }
  }

  return {
    id: order.id,
    name: order.name || '',
    pos_reference: order.pos_reference || '',
    partner: Array.isArray(order.partner_id) ? { id: order.partner_id[0], name: order.partner_id[1] } : null,
    user: Array.isArray(order.user_id) ? { id: order.user_id[0], name: order.user_id[1] } : null,
    session: Array.isArray(order.session_id) ? { id: order.session_id[0], name: order.session_id[1] } : null,
    config: Array.isArray(order.config_id) ? { id: order.config_id[0], name: order.config_id[1] } : null,
    date_order: order.date_order || null,
    amount_total: Number(order.amount_total) || 0,
    amount_tax: Number(order.amount_tax) || 0,
    amount_paid: Number(order.amount_paid) || 0,
    amount_return: Number(order.amount_return) || 0,
    state: order.state || 'draft',
    lines,
  };
};

// Fetch sales report data from Odoo
export const fetchSalesReportData = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let domain = [];

    // Filter by date range if provided
    if (startDate && endDate) {
      domain = [
        ['date_order', '>=', startDate],
        ['date_order', '<=', endDate],
        ['state', '!=', 'cancel'] // Exclude only cancelled orders
      ];
    } else {
      domain = [['state', '!=', 'cancel']];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'partner_id', 'user_id', 'date_order', 'amount_total', 'amount_tax', 'state', 'lines', 'session_id', 'payment_ids'],
          order: 'date_order desc',
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH SALES REPORT] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orders = response.data.result || [];
    console.log('[FETCH SALES REPORT] Retrieved orders count:', orders.length);
    console.log('[FETCH SALES REPORT] Orders with states:', orders.map(o => ({ name: o.name, state: o.state, amount: o.amount_total })));

    // Calculate summary statistics
    const totalSales = orders.reduce((sum, order) => sum + (order.amount_total || 0), 0);
    const totalOrders = orders.length;
    const averageOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
    const totalTax = orders.reduce((sum, order) => sum + (order.amount_tax || 0), 0);

    return {
      orders,
      summary: {
        totalSales,
        totalOrders,
        averageOrder,
        totalTax,
      }
    };
  } catch (error) {
    console.error('fetchSalesReportData error:', error);
    throw error;
  }
};

// Fetch top selling products
export const fetchTopProducts = async ({ startDate = null, endDate = null, limit = 10 } = {}) => {
  try {
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['order_id.date_order', '>=', startDate],
        ['order_id.date_order', '<=', endDate],
        ['order_id.state', '!=', 'cancel']
      ];
    } else {
      domain = [['order_id.state', '!=', 'cancel']];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['product_id', 'qty', 'price_subtotal', 'price_subtotal_incl'],
          limit: 1000, // Get many lines to aggregate
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH TOP PRODUCTS] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orderLines = response.data.result || [];

    // Aggregate by product
    const productMap = {};
    orderLines.forEach(line => {
      const productId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
      const productName = Array.isArray(line.product_id) ? line.product_id[1] : 'Unknown Product';

      if (!productMap[productId]) {
        productMap[productId] = {
          id: productId,
          name: productName,
          quantity: 0,
          revenue: 0,
        };
      }

      productMap[productId].quantity += line.qty || 0;
      productMap[productId].revenue += line.price_subtotal_incl || 0;
    });

    // Convert to array and sort by revenue
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);

    console.log('[FETCH TOP PRODUCTS] Top products count:', topProducts.length);
    return topProducts;
  } catch (error) {
    console.error('fetchTopProducts error:', error);
    throw error;
  }
};

// Fetch sales by salesperson
export const fetchSalesByUser = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['date_order', '>=', startDate],
        ['date_order', '<=', endDate],
        ['state', '!=', 'cancel']
      ];
    } else {
      domain = [['state', '!=', 'cancel']];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['user_id', 'amount_total'],
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH SALES BY USER] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orders = response.data.result || [];

    // Aggregate by user
    const userMap = {};
    orders.forEach(order => {
      const userId = Array.isArray(order.user_id) ? order.user_id[0] : order.user_id;
      const userName = Array.isArray(order.user_id) ? order.user_id[1] : 'Unknown User';

      if (!userMap[userId]) {
        userMap[userId] = {
          id: userId,
          name: userName,
          totalSales: 0,
          orderCount: 0,
        };
      }

      userMap[userId].totalSales += order.amount_total || 0;
      userMap[userId].orderCount += 1;
    });

    // Convert to array and sort by sales
    const salesByUser = Object.values(userMap)
      .sort((a, b) => b.totalSales - a.totalSales);

    console.log('[FETCH SALES BY USER] Users count:', salesByUser.length);
    return salesByUser;
  } catch (error) {
    console.error('fetchSalesByUser error:', error);
    throw error;
  }
};

// Fetch sales by category (like Odoo 19 Category Report)
export const fetchSalesByCategory = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['order_id.date_order', '>=', startDate],
        ['order_id.date_order', '<=', endDate],
        ['order_id.state', '!=', 'cancel']
      ];
    } else {
      domain = [['order_id.state', '!=', 'cancel']];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['product_id', 'qty', 'price_subtotal', 'price_subtotal_incl'],
          limit: 2000,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH SALES BY CATEGORY] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orderLines = response.data.result || [];

    // For now, we'll group by product since category requires additional API call
    // In a full implementation, you'd fetch product.template with categ_id
    const categoryMap = {
      'All Products': {
        name: 'All Products',
        quantity: 0,
        revenue: 0,
      }
    };

    orderLines.forEach(line => {
      categoryMap['All Products'].quantity += line.qty || 0;
      categoryMap['All Products'].revenue += line.price_subtotal_incl || 0;
    });

    const categorySales = Object.values(categoryMap);
    console.log('[FETCH SALES BY CATEGORY] Categories:', categorySales.length);
    return categorySales;
  } catch (error) {
    console.error('fetchSalesByCategory error:', error);
    throw error;
  }
};

// Fetch payment methods breakdown (like Odoo 19 Payment Report)
export const fetchPaymentMethods = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['payment_date', '>=', startDate],
        ['payment_date', '<=', endDate],
      ];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['payment_method_id', 'amount'],
          limit: 1000,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH PAYMENT METHODS] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const payments = response.data.result || [];

    // Aggregate by payment method
    const paymentMap = {};
    payments.forEach(payment => {
      const methodId = Array.isArray(payment.payment_method_id) ? payment.payment_method_id[0] : payment.payment_method_id;
      const methodName = Array.isArray(payment.payment_method_id) ? payment.payment_method_id[1] : 'Unknown Method';

      if (!paymentMap[methodId]) {
        paymentMap[methodId] = {
          id: methodId,
          name: methodName,
          total: 0,
          count: 0,
        };
      }

      paymentMap[methodId].total += payment.amount || 0;
      paymentMap[methodId].count += 1;
    });

    const paymentMethods = Object.values(paymentMap)
      .sort((a, b) => b.total - a.total);

    console.log('[FETCH PAYMENT METHODS] Methods count:', paymentMethods.length);
    return paymentMethods;
  } catch (error) {
    console.error('fetchPaymentMethods error:', error);
    throw error;
  }
};

// Fetch company currency symbol
export const fetchCompanyCurrency = async () => {
  try {
    console.log('[FETCH CURRENCY] Fetching company currency...');

    // Get the main company (usually ID 1, but we'll fetch it properly)
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.company',
        method: 'search_read',
        args: [[]],
        kwargs: {
          fields: ['currency_id'],
          limit: 1,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH CURRENCY] Odoo error:', response.data.error);
      return { symbol: '$', name: 'USD' }; // Fallback
    }

    const companies = response.data.result || [];
    if (companies.length === 0) {
      console.warn('[FETCH CURRENCY] No company found, using fallback');
      return { symbol: '$', name: 'USD' };
    }

    const currencyId = Array.isArray(companies[0].currency_id)
      ? companies[0].currency_id[0]
      : companies[0].currency_id;

    // Now fetch currency details
    const currencyResponse = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.currency',
        method: 'read',
        args: [[currencyId]],
        kwargs: {
          fields: ['symbol', 'name', 'position'],
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (currencyResponse.data && currencyResponse.data.error) {
      console.error('[FETCH CURRENCY] Currency read error:', currencyResponse.data.error);
      return { symbol: '$', name: 'USD' };
    }

    const currencyData = currencyResponse.data.result[0];
    const currencyInfo = {
      symbol: currencyData.symbol || '$',
      name: currencyData.name || 'USD',
      position: currencyData.position || 'before', // 'before' or 'after'
    };

    console.log('[FETCH CURRENCY] Currency fetched:', currencyInfo);
    return currencyInfo;
  } catch (error) {
    console.error('fetchCompanyCurrency error:', error);
    return { symbol: '$', name: 'USD', position: 'before' }; // Fallback
  }
};

// ─── hr.expense helpers ─────────────────────────────────────────────────────

// Resolve the logged-in res.users to its hr.employee id. Returns null if the
// user has no linked employee record (which means hr.expense filing won't
// work — the caller should surface a helpful toast).
export const fetchCurrentEmployeeIdOdoo = async (uid) => {
  if (!uid) return null;
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.employee',
        method: 'search_read',
        args: [[['user_id', '=', Number(uid)]]],
        kwargs: { fields: ['id', 'name'], limit: 1 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      console.warn('fetchCurrentEmployeeIdOdoo error:', resp.data.error?.data?.message);
      return null;
    }
    const row = (resp.data.result || [])[0];
    return row ? { id: row.id, name: row.name } : null;
  } catch (e) {
    console.warn('fetchCurrentEmployeeIdOdoo failed:', e?.message);
    return null;
  }
};

// product.product rows that can be picked as an expense category.
export const fetchExpenseCategoriesOdoo = async () => {
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.product',
        method: 'search_read',
        args: [[['can_be_expensed', '=', true]]],
        kwargs: { fields: ['id', 'name', 'default_code', 'list_price'], order: 'name asc', limit: 200 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return [];
    return (resp.data.result || []).map((p) => ({
      id: p.id,
      name: p.default_code ? `[${p.default_code}] ${p.name}` : p.name,
      list_price: Number(p.list_price) || 0,
    }));
  } catch (e) {
    console.warn('fetchExpenseCategoriesOdoo failed:', e?.message);
    return [];
  }
};

// Odoo's hr.expense.state values shifted in newer versions: legacy DBs use
// 'reported' for submitted-but-not-approved expenses and 'done' for the
// reimbursed/paid state, while Odoo 17+ uses 'submitted' and 'paid'. Map
// each canonical chip key to BOTH so the same code works on either schema
// without forcing the operator to configure a flag. Used by both the list
// fetcher and the totals fetcher.
const HR_EXPENSE_STATE_ALIASES = {
  reported:  ['reported', 'submitted'],
  submitted: ['reported', 'submitted'],
  done:      ['done', 'paid'],
  paid:      ['done', 'paid'],
};

// List of hr.expense rows for the current employee. Optional state filter
// ('draft' | 'reported'/'submitted' | 'approved' | 'done'/'paid' | 'refused')
// and a free-text search across the description.
export const fetchExpensesOdoo = async ({ employeeId, searchText = '', state = null, offset = 0, limit = 50 } = {}) => {
  const baseUrl = getOdooUrl();
  // No explicit employee filter by default — let Odoo's own access rules
  // decide what the logged-in user can see. Admins/managers see every
  // employee's expenses (matching Odoo's "My Expenses" admin view); regular
  // employees see only their own because of Odoo's record-rule on
  // hr.expense. Pass `employeeId` only when the screen explicitly wants to
  // narrow further.
  let domain = [];
  if (employeeId) {
    domain = domain.concat([['employee_id', '=', Number(employeeId)]]);
  }
  if (searchText && String(searchText).trim()) {
    const term = String(searchText).trim();
    domain = domain.concat([['name', 'ilike', term]]);
  }
  if (state) {
    const states = HR_EXPENSE_STATE_ALIASES[state] || [state];
    domain = domain.concat([['state', 'in', states]]);
  }
  // Three-step fetch:
  //   1. richFields  — everything (works on Odoo 14–17 with sheets)
  //   2. midFields   — drops `sheet_id` (Odoo 18+ removed it) but keeps
  //                    duplicate_expense_ids + message_attachment_count
  //                    so the paperclip + duplicate banner still work
  //   3. safeFields  — bare minimum, used only when a third field is
  //                    rejected (e.g. duplicate_expense_ids on a tiny
  //                    custom Odoo)
  // Without the middle step, an Odoo 19 server rejecting `sheet_id`
  // would fall straight to safeFields and the attachment-count chip on
  // the list would disappear.
  const baseFields = [
    'id', 'name', 'date', 'product_id', 'employee_id',
    'total_amount', 'payment_mode', 'state', 'description',
  ];
  const richFields = [
    ...baseFields,
    'sheet_id',
    'duplicate_expense_ids',
    'message_attachment_count',
  ];
  const midFields = [
    ...baseFields,
    'duplicate_expense_ids',
    'message_attachment_count',
  ];
  const safeFields = baseFields;

  const callRead = async (fields) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'search_read',
        args: [domain],
        kwargs: { fields, order: 'date desc, id desc', offset, limit },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result || [];
  };

  let raw = [];
  try {
    raw = await callRead(richFields);
  } catch (err) {
    // Odoo 18+ rejects `sheet_id`. Retry with midFields, which keeps
    // duplicate_expense_ids and message_attachment_count so the
    // paperclip chip and duplicate banner still work.
    console.warn(
      'fetchExpensesOdoo rich fetch failed, retrying without sheet_id:',
      err?.payload?.data?.message || err?.message
    );
    try {
      raw = await callRead(midFields);
    } catch (err2) {
      // A third field is rejected too (rare — e.g. duplicate_expense_ids
      // missing on a stripped Odoo). Drop everything beyond the base
      // shape; the list still renders, just without paperclip + banner.
      console.warn(
        'fetchExpensesOdoo mid fetch failed, retrying without optional fields:',
        err2?.payload?.data?.message || err2?.message
      );
      try {
        raw = await callRead(safeFields);
      } catch (err3) {
        console.error('fetchExpensesOdoo safe fetch also failed:', err3?.payload?.data?.message || err3?.message);
        return [];
      }
    }
  }

  try {
    return raw.map((e) => ({
      id: e.id,
      name: e.name || '',
      date: e.date || null,
      category: Array.isArray(e.product_id) ? { id: e.product_id[0], name: e.product_id[1] } : null,
      employee: Array.isArray(e.employee_id) ? { id: e.employee_id[0], name: e.employee_id[1] } : null,
      total_amount: Number(e.total_amount) || 0,
      payment_mode: e.payment_mode || 'own_account',
      state: e.state || 'draft',
      description: e.description || '',
      // [id, name] tuple when the expense has been submitted (creates a
      // sheet); false otherwise. Used by the detail screen to dispatch
      // approve/refuse/reset against the right sheet.
      sheet_id: Array.isArray(e.sheet_id) ? e.sheet_id[0] : null,
      // Other expenses sharing this receipt — drives the yellow
      // "An expense with the same receipt already exists" banner.
      duplicate_expense_ids: Array.isArray(e.duplicate_expense_ids) ? e.duplicate_expense_ids : [],
      // Number of attached files; rendered as a paperclip + count on
      // the list row (matches Odoo's web list view).
      message_attachment_count: Number(e.message_attachment_count) || 0,
    }));
  } catch (e) {
    console.warn('fetchExpensesOdoo failed:', e?.message);
    return [];
  }
};

// Read a single hr.expense by id with the same shape fetchExpensesOdoo
// returns. Used to refresh the detail screen instantly after a workflow
// action (Approve/Refuse/Reset/Post) without paging the whole list.
// Same defensive richFields → safeFields fallback so it survives field
// removals across Odoo versions.
export const fetchExpenseByIdOdoo = async (expenseId) => {
  if (!expenseId) return null;
  const baseUrl = getOdooUrl();
  const richFields = [
    'id', 'name', 'date', 'product_id', 'employee_id',
    'total_amount', 'payment_mode', 'state', 'description',
    'sheet_id', 'duplicate_expense_ids', 'message_attachment_count',
  ];
  const safeFields = [
    'id', 'name', 'date', 'product_id', 'employee_id',
    'total_amount', 'payment_mode', 'state', 'description',
  ];
  const callRead = async (fields) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'read',
        args: [[Number(expenseId)], fields],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result || [];
  };

  let raw = [];
  try {
    raw = await callRead(richFields);
  } catch (_) {
    try {
      raw = await callRead(safeFields);
    } catch (_) {
      return null;
    }
  }
  const e = raw[0];
  if (!e) return null;
  return {
    id: e.id,
    name: e.name || '',
    date: e.date || null,
    category: Array.isArray(e.product_id) ? { id: e.product_id[0], name: e.product_id[1] } : null,
    employee: Array.isArray(e.employee_id) ? { id: e.employee_id[0], name: e.employee_id[1] } : null,
    total_amount: Number(e.total_amount) || 0,
    payment_mode: e.payment_mode || 'own_account',
    state: e.state || 'draft',
    description: e.description || '',
    sheet_id: Array.isArray(e.sheet_id) ? e.sheet_id[0] : null,
    duplicate_expense_ids: Array.isArray(e.duplicate_expense_ids) ? e.duplicate_expense_ids : [],
    message_attachment_count: Number(e.message_attachment_count) || 0,
  };
};

// Returns { to_submit, waiting_approval, waiting_reimbursement } as numeric totals.
export const fetchExpenseTotalsOdoo = async ({ employeeId } = {}) => {
  const empty = { to_submit: 0, waiting_approval: 0, waiting_reimbursement: 0 };
  const baseUrl = getOdooUrl();
  // Same access-rule story as fetchExpensesOdoo — when no employeeId is
  // provided, let Odoo's record rules decide what the user can sum.
  // Accepts either a string (looked up in HR_EXPENSE_STATE_ALIASES) or
  // an array of literal state values (bypassing the alias map). The
  // literal form is needed for "Waiting Reimbursement" which must be
  // ONLY 'done' (posted, awaiting payment) and NOT 'paid' (final).
  //
  // The optional `options.ownAccountOnly` controls whether we narrow to
  // employee-paid (`own_account`) rows. Odoo's dashboard does this for
  // To Submit / Waiting Reimbursement (employee-side counters) but NOT
  // for Waiting Approval, which is a manager-side counter that includes
  // company-card expenses too.
  const sumFor = async (stateOrStates, options = {}) => {
    const states = Array.isArray(stateOrStates)
      ? stateOrStates
      : (HR_EXPENSE_STATE_ALIASES[stateOrStates] || [stateOrStates]);
    const domain = [['state', 'in', states]];
    if (options.ownAccountOnly !== false) {
      domain.push(['payment_mode', '=', 'own_account']);
    }
    if (employeeId) domain.unshift(['employee_id', '=', Number(employeeId)]);
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['total_amount'], limit: 5000 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return 0;
    return (resp.data.result || []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  };
  try {
    const [draft, reported, approved] = await Promise.all([
      sumFor('draft'),
      // Waiting Approval is a manager-side counter: it shows every
      // submitted expense regardless of payment_mode (employee-paid +
      // company-card). Odoo's web dashboard sums them all here.
      sumFor('reported', { ownAccountOnly: false }),
      // Odoo's "Waiting Reimbursement" totals own-account expenses in
      // state='approved' — manager approved, accountant has yet to post
      // and pay. Match what the user sees in Odoo's web dashboard.
      sumFor(['approved']),
    ]);
    return {
      to_submit: draft,
      waiting_approval: reported,
      waiting_reimbursement: approved,
    };
  } catch (e) {
    console.warn('fetchExpenseTotalsOdoo failed:', e?.message);
    return empty;
  }
};

// Create an hr.expense row (state stays 'draft' until submitted).
export const createExpenseOdoo = async ({ name, date, productId, totalAmount, paymentMode, description, employeeId } = {}) => {
  if (!name || !String(name).trim()) {
    return { error: { message: 'Description is required' } };
  }
  if (!employeeId) return { error: { message: 'No employee linked to your user' } };
  const baseUrl = getOdooUrl();
  const vals = {
    name: String(name).trim(),
    employee_id: Number(employeeId),
    payment_mode: paymentMode === 'company_account' ? 'company_account' : 'own_account',
  };
  if (date) vals.date = date;
  if (productId) vals.product_id = Number(productId);
  if (totalAmount !== undefined && totalAmount !== '' && totalAmount !== null) {
    vals.total_amount = Number(totalAmount) || 0;
  }
  if (description) vals.description = String(description).trim();

  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'hr.expense', method: 'create', args: [vals], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      return { error: resp.data.error };
    }
    return { result: resp.data.result };
  } catch (e) {
    console.error('createExpenseOdoo error:', e?.message);
    return { error: { message: e?.message || 'Create failed' } };
  }
};

// Update an existing hr.expense (only valid while state is 'draft').
export const updateExpenseOdoo = async (expenseId, { name, date, productId, totalAmount, paymentMode, description } = {}) => {
  if (!expenseId) return { error: { message: 'expenseId is required' } };
  const baseUrl = getOdooUrl();
  const vals = {};
  if (name !== undefined) vals.name = String(name).trim();
  if (date !== undefined) vals.date = date || false;
  if (productId !== undefined) vals.product_id = productId || false;
  if (totalAmount !== undefined && totalAmount !== '' && totalAmount !== null) {
    vals.total_amount = Number(totalAmount) || 0;
  }
  if (paymentMode !== undefined) {
    vals.payment_mode = paymentMode === 'company_account' ? 'company_account' : 'own_account';
  }
  if (description !== undefined) vals.description = description ? String(description).trim() : false;

  const writeOnce = async (payload) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'hr.expense', method: 'write', args: [[expenseId], payload], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    return resp.data;
  };

  try {
    const data = await writeOnce(vals);
    if (data && data.error) {
      const msg = data.error?.data?.message || data.error?.message || '';
      // Odoo 18+ renamed `total_amount` → `total_amount_currency` in some
      // configurations. If the write was rejected because of that field,
      // retry once with the alternate name. Same idea for `payment_mode`
      // which a few private modules rename to `payment_method`.
      const retryVals = { ...vals };
      let retryNeeded = false;
      if (/Invalid field 'total_amount'/i.test(msg) && 'total_amount' in retryVals) {
        retryVals.total_amount_currency = retryVals.total_amount;
        delete retryVals.total_amount;
        retryNeeded = true;
      }
      if (/Invalid field 'payment_mode'/i.test(msg) && 'payment_mode' in retryVals) {
        delete retryVals.payment_mode;
        retryNeeded = true;
      }
      if (retryNeeded) {
        const data2 = await writeOnce(retryVals);
        if (data2 && data2.error) return { error: data2.error };
        return { result: expenseId };
      }
      return { error: data.error };
    }
    return { result: expenseId };
  } catch (e) {
    console.error('updateExpenseOdoo error:', e?.message);
    return { error: { message: e?.message || 'Update failed' } };
  }
};

// Sum hr.expense for the period (shop-wide, NOT scoped by employee). Used by
// the Sales Report's P&L card to compute Net Profit.
export const fetchOperatingExpensesOdoo = async ({ startDate = null, endDate = null } = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [];
  if (startDate) domain.push(['date', '>=', String(startDate).slice(0, 10)]);
  if (endDate) domain.push(['date', '<=', String(endDate).slice(0, 10)]);
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['total_amount'], limit: 5000 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      console.warn('fetchOperatingExpensesOdoo error:', resp.data.error?.data?.message);
      return { total: 0 };
    }
    const total = (resp.data.result || []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    return { total };
  } catch (e) {
    console.warn('fetchOperatingExpensesOdoo failed:', e?.message);
    return { total: 0 };
  }
};

// Compute revenue, COGS, gross profit, gross margin for paid/done/invoiced
// pos.order rows in the period.
export const fetchSalesProfitOdoo = async ({ startDate = null, endDate = null } = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [['state', 'in', ['paid', 'done', 'invoiced']]];
  if (startDate) domain.push(['date_order', '>=', startDate]);
  if (endDate) domain.push(['date_order', '<=', endDate]);
  try {
    // 1) orders + their line refs + revenue
    const ordersResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'amount_total', 'lines'], limit: 5000 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (ordersResp.data && ordersResp.data.error) {
      console.warn('fetchSalesProfitOdoo orders error:', ordersResp.data.error?.data?.message);
      return { revenue: 0, cogs: 0, gross_profit: 0, gross_margin_pct: 0 };
    }
    const orders = ordersResp.data.result || [];
    const revenue = orders.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
    const allLineIds = [];
    orders.forEach((o) => {
      if (Array.isArray(o.lines)) o.lines.forEach((id) => allLineIds.push(id));
    });
    if (allLineIds.length === 0) {
      return { revenue, cogs: 0, gross_profit: revenue, gross_margin_pct: revenue ? 100 : 0 };
    }

    // 2) read all lines (qty + product_id)
    const linesResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'read',
        args: [allLineIds],
        kwargs: { fields: ['id', 'product_id', 'qty'] },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (linesResp.data && linesResp.data.error) {
      console.warn('fetchSalesProfitOdoo lines error:', linesResp.data.error?.data?.message);
      return { revenue, cogs: 0, gross_profit: revenue, gross_margin_pct: revenue ? 100 : 0 };
    }
    const lines = linesResp.data.result || [];
    const productIds = [...new Set(
      lines.map((l) => Array.isArray(l.product_id) ? l.product_id[0] : null).filter(Boolean)
    )];

    // 3) read product cost (standard_price); fall back to list_price if rejected
    let priceById = {};
    const callRead = async (fields) => {
      const r = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'read',
          args: [productIds],
          kwargs: { fields },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (r.data && r.data.error) {
        const e = new Error('Odoo JSON-RPC error');
        e.payload = r.data.error;
        throw e;
      }
      return r.data.result || [];
    };
    let prodRows = [];
    try {
      prodRows = await callRead(['id', 'standard_price']);
    } catch (err) {
      console.warn('fetchSalesProfitOdoo standard_price rejected, falling back to list_price:',
        err?.payload?.data?.message || err?.message);
      try {
        prodRows = await callRead(['id', 'list_price']);
      } catch (err2) {
        prodRows = [];
      }
    }
    prodRows.forEach((p) => {
      priceById[p.id] = Number(p.standard_price ?? p.list_price ?? 0);
    });

    // 4) COGS = sum(line.qty * priceById[line.product_id])
    let cogs = 0;
    lines.forEach((l) => {
      const pid = Array.isArray(l.product_id) ? l.product_id[0] : null;
      const cost = priceById[pid] || 0;
      cogs += (Number(l.qty) || 0) * cost;
    });
    const gross_profit = revenue - cogs;
    const gross_margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
    return { revenue, cogs, gross_profit, gross_margin_pct };
  } catch (e) {
    console.warn('fetchSalesProfitOdoo failed:', e?.message);
    return { revenue: 0, cogs: 0, gross_profit: 0, gross_margin_pct: 0 };
  }
};

// Submit a draft expense → bundles into an hr.expense.sheet via the standard
// Odoo action. After this the expense moves to state='reported'.
export const submitExpenseOdoo = async (expenseId) => {
  if (!expenseId) return { error: { message: 'expenseId is required' } };
  const baseUrl = getOdooUrl();
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'action_submit_expenses',
        args: [[expenseId]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return { error: resp.data.error };
    return { result: resp.data.result };
  } catch (e) {
    console.error('submitExpenseOdoo error:', e?.message);
    return { error: { message: e?.message || 'Submit failed' } };
  }
};

// Workflow-action dispatcher: tries each (model, method) candidate in
// order and returns the first one that succeeds. Older Odoo (≤17) puts
// the workflow methods on `hr.expense.sheet`; Odoo 18+ removed sheets
// and put them on `hr.expense`; Odoo 19 renamed several of those again.
// Encoding multiple candidates lets the same app code work against any
// of those schemas without a hard-coded version flag.
//
// Final fallback: when every named method 404s (Odoo 19 renamed enough
// of them that none of the names we know about work), fall back to
// writing the target state directly via `hr.expense.write({state: …})`.
// This skips the side-effects an action method would do (chatter
// messages, sheet creation, journal moves), but for plain state
// transitions it's a reasonable last resort that keeps the UI working.
const tryExpenseAction = async ({ expenseId, sheetId, candidates, kwargs = {}, fallbackState = null }) => {
  const baseUrl = getOdooUrl();
  let lastErr = null;
  for (const c of candidates) {
    const targetId = c.model === 'hr.expense.sheet' ? sheetId : expenseId;
    if (!targetId) continue;
    try {
      const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: c.model,
          method: c.method,
          args: [[targetId]],
          kwargs,
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (resp.data && resp.data.error) {
        lastErr = resp.data.error;
        // "Method does not exist" / "Invalid field" — try the next candidate.
        continue;
      }
      return { result: resp.data.result };
    } catch (e) {
      lastErr = { message: e?.message || `${c.method} failed` };
      continue;
    }
  }

  // All method candidates failed. Last-ditch: write state directly.
  if (fallbackState && expenseId) {
    try {
      const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.expense',
          method: 'write',
          args: [[expenseId], { state: fallbackState }],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (resp.data && resp.data.error) {
        lastErr = resp.data.error;
      } else {
        return { result: resp.data.result };
      }
    } catch (e) {
      lastErr = { message: e?.message || 'state write failed' };
    }
  }

  console.error('All expense action candidates failed:', lastErr);
  return { error: lastErr || { message: 'No matching workflow method on this Odoo' } };
};

export const approveExpenseSheetOdoo = (sheetId, expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    candidates: [
      { model: 'hr.expense', method: 'action_approve' },
      { model: 'hr.expense.sheet', method: 'approve_expense_sheets' },
      { model: 'hr.expense.sheet', method: 'action_approve_expense_sheets' },
    ],
    fallbackState: 'approved',
  });

export const refuseExpenseSheetOdoo = (sheetId, reason = '', expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    kwargs: { reason: String(reason || '') },
    candidates: [
      { model: 'hr.expense', method: 'action_refuse' },
      { model: 'hr.expense', method: 'refuse_expense' },
      { model: 'hr.expense.sheet', method: 'refuse_sheet' },
    ],
    fallbackState: 'refused',
  });

export const resetExpenseSheetOdoo = (sheetId, expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    candidates: [
      { model: 'hr.expense', method: 'action_reset_to_draft' },
      { model: 'hr.expense', method: 'action_reset_expense' },
      { model: 'hr.expense.sheet', method: 'action_reset_expense_sheets' },
    ],
    fallbackState: 'draft',
  });

// List every ir.attachment row linked to an hr.expense, in upload order.
// Returned shape: [{ id, name, mimetype, datas, url }, ...] where `datas`
// is the base64 payload (may be missing for very large files where Odoo
// returns just the URL) and `url` is the authenticated download endpoint
// the WebView/PDF viewer can load when base64 isn't usable.
export const fetchExpenseAttachmentsOdoo = async (expenseId) => {
  if (!expenseId) return [];
  const baseUrl = getOdooUrl();
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'ir.attachment',
        method: 'search_read',
        args: [[
          ['res_model', '=', 'hr.expense'],
          ['res_id', '=', Number(expenseId)],
        ]],
        kwargs: {
          fields: ['id', 'name', 'mimetype', 'datas', 'file_size'],
          order: 'id asc',
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      console.warn('fetchExpenseAttachmentsOdoo error:', resp.data.error?.data?.message);
      return [];
    }
    const rows = resp.data?.result || [];
    return rows.map((a) => ({
      id: a.id,
      name: a.name || `Attachment ${a.id}`,
      mimetype: a.mimetype || 'application/octet-stream',
      datas: a.datas || null,
      url: `${baseUrl}/web/content/${a.id}?download=true`,
      file_size: a.file_size || 0,
    }));
  } catch (e) {
    console.warn('fetchExpenseAttachmentsOdoo failed:', e?.message);
    return [];
  }
};

// Upload a base64 image as an `ir.attachment` linked to an hr.expense
// row. Mirrors Odoo's "Attach Receipt" button which creates an
// ir.attachment with res_model='hr.expense' and res_id pointing at the
// expense — and (for the first attachment) writes back to the expense's
// `message_main_attachment_id` so it shows as the receipt thumbnail.
export const attachReceiptToExpenseOdoo = async ({ expenseId, base64, mimetype = 'image/jpeg', filename = 'receipt.jpg' } = {}) => {
  if (!expenseId) return { error: { message: 'expenseId is required' } };
  if (!base64) return { error: { message: 'no file selected' } };
  const baseUrl = getOdooUrl();
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'ir.attachment',
        method: 'create',
        args: [{
          name: filename,
          datas: base64,
          mimetype,
          res_model: 'hr.expense',
          res_id: Number(expenseId),
          type: 'binary',
        }],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return { error: resp.data.error };
    return { result: resp.data.result };
  } catch (e) {
    console.error('attachReceiptToExpenseOdoo error:', e?.message);
    return { error: { message: e?.message || 'Attach failed' } };
  }
};

// Post journal entries — accountant action that flips state from approved
// to done/posted. Different across Odoo versions, so we probe candidates.
export const postExpenseEntriesOdoo = (sheetId, expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    candidates: [
      { model: 'hr.expense', method: 'action_post' },
      { model: 'hr.expense.sheet', method: 'action_sheet_move_post' },
      { model: 'hr.expense.sheet', method: 'action_sheet_move_create' },
    ],
    fallbackState: 'done',
  });