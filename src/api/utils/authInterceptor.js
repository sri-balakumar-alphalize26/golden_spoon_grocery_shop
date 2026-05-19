// Auth interceptor — attaches the saved Odoo session cookie AND the
// authenticated user's company context to every outgoing axios request.
//
// Two responsibilities:
// 1. Session cookie. Without this, the JS bundle's reload loses the
//    in-memory cookie the native HTTP stack stored at login, and Odoo
//    returns 404 on /web/dataset/call_kw.
// 2. Company context. Non-admin users see empty lists when call_kw
//    requests omit `kwargs.context.allowed_company_ids`. Odoo's record
//    rules then fall back to the default context, which often filters
//    everything out for restricted users. We inject the saved
//    allowed_company_ids (and company_id) into every call_kw request
//    that doesn't already carry an explicit context.
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

let installed = false;

// Cached auth context. Populated lazily from AsyncStorage['userData'] on
// the first call_kw of a session, invalidated by invalidateAuthContextCache
// (called from LoginScreen on successful login and from logout).
let _ctxCache = null;
let _loggedLoginOnce = false;
let _loggedFirstRpc = false;

const isOdooJsonRpcUrl = (url = '') => {
  if (!url) return false;
  return /\/(web\/dataset\/call_kw|web\/session\/|jsonrpc|web\/image|longpolling)/i.test(url);
};

const isCallKwUrl = (url = '') => /\/web\/dataset\/call_kw/i.test(url);

const _readContextOnce = async () => {
  if (_ctxCache !== null) return _ctxCache;
  try {
    const raw = await AsyncStorage.getItem('userData');
    const u = raw ? JSON.parse(raw) : null;
    // Odoo returns allowed_company_ids in `user_context` on /web/session/authenticate
    // for all versions; some installs also expose it at the top level.
    const allowed =
      (Array.isArray(u?.allowed_company_ids) && u.allowed_company_ids.length > 0 && u.allowed_company_ids)
      || (Array.isArray(u?.user_context?.allowed_company_ids) && u.user_context.allowed_company_ids.length > 0 && u.user_context.allowed_company_ids)
      || null;
    const companyId = Array.isArray(u?.company_id) ? u.company_id[0] : (u?.company_id || null);
    const ctx = {};
    if (Array.isArray(allowed)) {
      ctx.allowed_company_ids = allowed;
    } else if (companyId) {
      ctx.allowed_company_ids = [companyId];
    }
    if (companyId) ctx.company_id = companyId;
    _ctxCache = ctx;
    if (!_loggedLoginOnce) {
      _loggedLoginOnce = true;
      console.log('[LOGIN] auth context resolved =', {
        uid: u?.uid || null,
        name: u?.name || null,
        company_id: companyId,
        allowed_company_ids: ctx.allowed_company_ids || null,
        source: Array.isArray(u?.allowed_company_ids) ? 'top-level' :
                Array.isArray(u?.user_context?.allowed_company_ids) ? 'user_context' :
                companyId ? 'company_id fallback' : 'none',
      });
    }
    return _ctxCache;
  } catch (e) {
    _ctxCache = {};
    console.warn('[LOGIN] auth context read failed:', e?.message || e);
    return _ctxCache;
  }
};

// Called from LoginScreen after successful auth and from logout, so the
// next request re-reads the fresh userData rather than the stale cache.
export const invalidateAuthContextCache = () => {
  _ctxCache = null;
  _loggedLoginOnce = false;
  _loggedFirstRpc = false;
};

export function installAuthInterceptor() {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use(async (config) => {
    try {
      if (!isOdooJsonRpcUrl(config?.url || '')) return config;

      // 1) Session cookie.
      const sessionId = await AsyncStorage.getItem('odoo_session_id');
      if (sessionId) {
        const headers = config.headers || {};
        const existingCookie = headers.Cookie || headers.cookie || '';
        if (!/session_id=/.test(String(existingCookie))) {
          headers.Cookie = existingCookie
            ? `${existingCookie}; session_id=${sessionId}`
            : `session_id=${sessionId}`;
        }
        config.headers = headers;
        config.withCredentials = true;
      }

      // 2) Inject allowed_company_ids into call_kw context so non-admin
      //    users see records their record-rules permit. Skip non-call_kw
      //    endpoints (/web/session/, /web/image, etc.) since they don't
      //    accept a kwargs.context shape.
      if (isCallKwUrl(config?.url || '') && config.data && config.data.params) {
        const ctx = await _readContextOnce();
        if (ctx.allowed_company_ids) {
          const params = config.data.params;
          const kwargs = params.kwargs || {};
          const existingContext = kwargs.context || {};
          // Only inject if the caller didn't already supply allowed_company_ids
          // (some helpers — fetchJournalEntriesOdoo, fetchPartnerLedgerOdoo,
          // fetchCustomerInvoicesOdoo — set their own context explicitly).
          if (!existingContext.allowed_company_ids) {
            kwargs.context = {
              ...existingContext,
              allowed_company_ids: ctx.allowed_company_ids,
              ...(ctx.company_id && !existingContext.company_id ? { company_id: ctx.company_id } : {}),
            };
            params.kwargs = kwargs;
            config.data.params = params;
            if (!_loggedFirstRpc) {
              _loggedFirstRpc = true;
              console.log('[RPC] first call_kw with injected context', {
                model: params.model,
                method: params.method,
                allowed_company_ids: ctx.allowed_company_ids,
                company_id: ctx.company_id || null,
              });
            }
          }
        }
      }
    } catch (_) {
      // Best-effort: never block the request because of an interceptor error.
    }
    return config;
  });
}

export default installAuthInterceptor;
