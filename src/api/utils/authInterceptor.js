// Auth interceptor — attaches the saved Odoo session cookie to every
// outgoing axios request. Without this, the JS bundle's reload/hot-restart
// loses the in-memory cookie that the native HTTP stack stored at login,
// and Odoo returns 404 on /web/dataset/call_kw (the JSON-RPC endpoint
// requires `auth='user'` and refuses unauthenticated requests with a 404
// in many deployments — see the [POSRegister]/[fetchProductsOdoo] error
// logs reported in the field).
//
// We re-read the saved session_id from AsyncStorage on each request (cheap)
// and add it as a Cookie header so calls are authenticated regardless of
// whether the platform's cookie jar survived the reload.
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

let installed = false;

const isOdooJsonRpcUrl = (url = '') => {
  if (!url) return false;
  // Cover the standard endpoints used by generalApi.js. We don't restrict by
  // host because getOdooUrl() resolves to whatever the user logged in with;
  // matching by path keeps the interceptor host-agnostic.
  return /\/(web\/dataset\/call_kw|web\/session\/|jsonrpc|web\/image|longpolling)/i.test(url);
};

export function installAuthInterceptor() {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use(async (config) => {
    try {
      if (!isOdooJsonRpcUrl(config?.url || '')) return config;

      const sessionId = await AsyncStorage.getItem('odoo_session_id');
      if (!sessionId) return config;

      const headers = config.headers || {};
      const existingCookie = headers.Cookie || headers.cookie || '';
      // Avoid duplicating the cookie if a caller already set it.
      if (!/session_id=/.test(String(existingCookie))) {
        const merged = existingCookie
          ? `${existingCookie}; session_id=${sessionId}`
          : `session_id=${sessionId}`;
        headers.Cookie = merged;
      }
      // Also tell axios to forward credentials in case the platform's cookie
      // jar still has a fresher cookie than what we saved.
      config.headers = headers;
      config.withCredentials = true;
    } catch (_) {
      // Best-effort: never block the request because of an interceptor error.
    }
    return config;
  });
}

export default installAuthInterceptor;
