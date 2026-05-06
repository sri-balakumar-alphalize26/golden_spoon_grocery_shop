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
export const fetchProductsOdoo = async () => {
  try {
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "product.product",
          method: "search_read",
          args: [[]],
          kwargs: {
            fields: [
              "id",
              "name",
              "default_code",
              "list_price",
              "qty_available",
              "image_128",
              "image_1920",
              "categ_id"
            ],
            limit: 50,
            order: "id asc"
          }
        }
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
    const baseUrl = (ODOO_BASE_URL || '').replace(/\/$/, '');

    // Attach image_url to each product
    results.forEach(p => {
      const hasBase64 = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0;
      p.image_url = hasBase64 ? `data:image/png;base64,${p.image_128}` : `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`;
    });

    return results;
  } catch (error) {
    console.error("fetchProductsOdoo error:", error);
    throw error;
  }
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

    // 1. Fetch product details
    const productResponse = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'search_read',
          args: [[['id', '=', productId]]],
          kwargs: {
            fields: [
              'id', 'name', 'list_price', 'default_code', 'uom_id', 'image_128',
              'description_sale', 'categ_id', 'qty_available', 'virtual_available'
            ],
            limit: 1,
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (productResponse.data.error) throw new Error('Odoo JSON-RPC error');
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

    // 3. Shape and return
    const hasBase64 = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0;
    const baseUrl = (ODOO_BASE_URL || '').replace(/\/$/, '');
    const imageUrl = hasBase64
      ? `data:image/png;base64,${p.image_128}`
      : `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`;

    return {
      id: p.id,
      product_name: p.name || '',
      image_url: imageUrl,
      price: p.list_price || 0,
      minimal_sales_price: p.list_price || null,
      inventory_ledgers,
      total_product_quantity: p.qty_available ?? p.virtual_available ?? 0,
      inventory_box_products_details: [],
      product_code: p.default_code || null,
      uom: p.uom_id ? { uom_id: p.uom_id[0], uom_name: p.uom_id[1] } : null,
      categ_id: p.categ_id || null,
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