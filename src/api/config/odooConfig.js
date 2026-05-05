// src/api/odooConfig.js
// No hardcoded server URL or DB. Everything comes from what the user typed
// at login. The login screen calls setRuntimeBaseUrl / setRuntimeDb on
// successful auth; on cold start we hydrate both from AsyncStorage so the
// API layer uses the correct server from the very first call after reload.
import AsyncStorage from '@react-native-async-storage/async-storage';

let runtimeBaseUrl = null;
let runtimeDb = null;

const normalizeUrl = (raw = "") => {
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
};

export const setRuntimeBaseUrl = (url) => {
  const n = normalizeUrl(url);
  runtimeBaseUrl = n || null;
};

export const setRuntimeDb = (db) => {
  const d = String(db || "").trim();
  runtimeDb = d || null;
};

export const getRuntimeBaseUrl = () => runtimeBaseUrl;
export const getRuntimeDb = () => runtimeDb;

// Returns the URL entered at login. Empty string if the user hasn't logged in
// yet — callers should treat that as "not ready" rather than falling back to
// some dev/test server.
export const getOdooUrl = () => runtimeBaseUrl || "";
export const getOdooDb = () => runtimeDb || "";

// Hydrate runtime values on module load from whatever login last saved.
(async () => {
  try {
    const raw = await AsyncStorage.getItem('savedCredentials');
    if (raw) {
      const c = JSON.parse(raw);
      if (c?.baseUrl) runtimeBaseUrl = normalizeUrl(c.baseUrl);
      if (c?.db) runtimeDb = String(c.db).trim();
    }
    // odoo_db may also have been written by login separately.
    if (!runtimeDb) {
      const db = await AsyncStorage.getItem('odoo_db');
      if (db) runtimeDb = db;
    }
  } catch (_) {}
})();

// Back-compat exports — these used to be hardcoded constants. Now they resolve
// to the live runtime values so any code still importing them picks up the
// user-entered URL/DB.
export const DEFAULT_ODOO_BASE_URL = "";
export const DEFAULT_ODOO_DB = "";
export default "";
