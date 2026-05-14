// src/api/services/currencyApi.js
// Fetches the connected Odoo company's currency (symbol, name, position)
// so the app can render the right currency regardless of which Odoo server
// the device is configured against.
//
// Two-step JSON-RPC `execute_kw`:
//   1. res.company → read currency_id of the user's company
//   2. res.currency → read {name, symbol, position} of that currency

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveCurrencyConfig, setActiveDigits } from '@utils/currency';

const JSONRPC_HEADERS = { 'Content-Type': 'application/json' };
const TIMEOUT_MS = 10000;

function normalizeUrl(baseUrl = '') {
  let url = baseUrl.trim();
  if (url && !url.startsWith('http')) url = 'http://' + url;
  return url.replace(/\/+$/, '');
}

function executeKw(baseUrl, { db, uid, password, model, method, args, kwargs = {} }) {
  return axios.post(
    `${normalizeUrl(baseUrl)}/jsonrpc`,
    {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, password, model, method, args, kwargs],
      },
    },
    { headers: JSONRPC_HEADERS, timeout: TIMEOUT_MS }
  );
}

/**
 * Read all decimal.precision records from Odoo and return them as a
 * map: { "Product Price": 3, "Discount": 2, ... }. Mirrors Odoo's
 * Settings → Technical → Decimal Accuracy admin list.
 */
export async function fetchDecimalAccuracy(baseUrl, db, uid, password) {
  console.log('[CURRENCY:API] fetchDecimalAccuracy entry');
  const res = await executeKw(baseUrl, {
    db, uid, password,
    model: 'decimal.precision',
    method: 'search_read',
    args: [[], ['name', 'digits']],
  });
  console.log('[CURRENCY:API] decimal.precision raw=', res.data);
  if (res.data?.error) {
    throw new Error(res.data.error.data?.message || 'Failed to read decimal.precision');
  }
  const rows = Array.isArray(res.data?.result) ? res.data.result : [];
  const map = {};
  for (const r of rows) if (r?.name) map[r.name] = Number(r.digits) || 0;
  console.log('[CURRENCY:API] decimal.precision normalized=', map);
  return map;
}

/**
 * Read the current user's company_id when /web/session/authenticate
 * didn't include it on the response (Odoo 17+ frequently omits it).
 * Returns the bare integer companyId.
 */
export async function fetchUserCompanyId(baseUrl, db, uid, password) {
  console.log('[CURRENCY:API] fetchUserCompanyId entry uid=', uid);
  const res = await executeKw(baseUrl, {
    db, uid, password,
    model: 'res.users',
    method: 'read',
    args: [[uid], ['company_id']],
  });
  console.log('[CURRENCY:API] res.users.read raw=', res.data);
  if (res.data?.error) {
    throw new Error(res.data.error.data?.message || 'Failed to read user');
  }
  const row = res.data?.result?.[0];
  const tuple = row?.company_id;
  if (!Array.isArray(tuple) || !tuple[0]) {
    throw new Error('User has no company_id');
  }
  return tuple[0];
}

/**
 * Fetch the currency config for a given Odoo company.
 * @param {string} baseUrl
 * @param {string} db
 * @param {number} uid
 * @param {string} password
 * @param {number} companyId
 * @returns {Promise<{symbol: string, name: string, position: 'before'|'after'}>}
 */
export async function fetchCompanyCurrency(baseUrl, db, uid, password, companyId) {
  console.log('[CURRENCY:API] fetchCompanyCurrency entry', { baseUrl, db, uid, companyId });
  if (!companyId) throw new Error('companyId is required');

  // Step 1: read currency_id from res.company
  const companyRes = await executeKw(baseUrl, {
    db, uid, password,
    model: 'res.company',
    method: 'read',
    args: [[companyId], ['currency_id']],
  });
  console.log('[CURRENCY:API] res.company.read raw=', companyRes.data);

  if (companyRes.data?.error) {
    throw new Error(companyRes.data.error.data?.message || 'Failed to read company');
  }
  const companyRow = companyRes.data?.result?.[0];
  const currencyTuple = companyRow?.currency_id; // [id, name] or false
  if (!Array.isArray(currencyTuple) || !currencyTuple[0]) {
    throw new Error('Company has no currency_id');
  }
  const currencyId = currencyTuple[0];
  console.log('[CURRENCY:API] resolved currencyId=', currencyId, 'name-from-company=', currencyTuple[1]);

  // Step 2: read symbol/name/position from res.currency
  const currencyRes = await executeKw(baseUrl, {
    db, uid, password,
    model: 'res.currency',
    method: 'read',
    args: [[currencyId], ['name', 'symbol', 'position']],
  });
  console.log('[CURRENCY:API] res.currency.read raw=', currencyRes.data);

  if (currencyRes.data?.error) {
    throw new Error(currencyRes.data.error.data?.message || 'Failed to read currency');
  }
  const currencyRow = currencyRes.data?.result?.[0];
  if (!currencyRow) throw new Error('Currency record not found');

  const position = currencyRow.position === 'after' ? 'after' : 'before';
  const result = {
    symbol: currencyRow.symbol || currencyRow.name || '',
    name: currencyRow.name || '',
    position,
  };
  console.log('[CURRENCY:API] returning normalized cfg=', result);
  return result;
}

// In-flight guard: two callers (initializeAuth + SplashScreen.boot) fire
// refreshCurrencyFromStorage concurrently at boot. Cache the active Promise
// so both receive the same result and the RPC chain runs exactly once.
let _refreshInFlight = null;

/**
 * Boot-time refresh: read credentials + uid + companyId from AsyncStorage,
 * fetch the current company currency from Odoo, persist the result.
 * Fire-and-forget — caller should not await this from the splash path.
 * Returns the new cfg on success, or null if any prerequisite is missing.
 */
export async function refreshCurrencyFromStorage() {
  if (_refreshInFlight) {
    console.log('[CURRENCY:REFRESH] join in-flight call');
    return _refreshInFlight;
  }
  _refreshInFlight = (async () => {
    return await _refreshCurrencyFromStorageImpl();
  })().finally(() => {
    _refreshInFlight = null;
  });
  return _refreshInFlight;
}

async function _refreshCurrencyFromStorageImpl() {
  console.log('[CURRENCY:REFRESH] begin');
  try {
    const [
      [, deviceUrl], [, deviceDb], [, rawSaved], [, rawUser],
    ] = await AsyncStorage.multiGet([
      'device_server_url', 'device_db_name', 'savedCredentials', 'userData',
    ]);

    const saved = rawSaved ? JSON.parse(rawSaved) : null;
    const user = rawUser ? JSON.parse(rawUser) : null;

    const baseUrl = deviceUrl || saved?.baseUrl;
    const db = deviceDb || saved?.db;
    const password = saved?.password;
    const uid = user?.uid;
    const companyId = Array.isArray(user?.company_id) ? user.company_id[0] : (user?.company_id || null);

    console.log('[CURRENCY:REFRESH] resolved creds', { baseUrl, db, hasPassword: !!password, uid, companyId });

    if (!baseUrl || !db || !password || !uid) {
      console.log('[CURRENCY:REFRESH] missing prerequisite (need baseUrl/db/password/uid), skipping');
      return null;
    }

    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      try {
        resolvedCompanyId = await fetchUserCompanyId(baseUrl, db, uid, password);
        console.log('[CURRENCY:REFRESH] resolved companyId via res.users.read =', resolvedCompanyId);
      } catch (e) {
        console.warn('[CURRENCY:REFRESH] could not resolve companyId:', e?.message || e);
        return null;
      }
    }

    const cfg = await fetchCompanyCurrency(baseUrl, db, uid, password, resolvedCompanyId);

    // Best-effort decimal.precision fetch — failure must NOT cancel the
    // currency update we already secured above.
    let digitsMap = null;
    try {
      digitsMap = await fetchDecimalAccuracy(baseUrl, db, uid, password);
      await AsyncStorage.setItem('decimalAccuracy', JSON.stringify(digitsMap));
      setActiveDigits(digitsMap);
      console.log('[CURRENCY:REFRESH] persisted digitsMap=', digitsMap);
    } catch (e) {
      console.warn('[CURRENCY:REFRESH] decimal.precision fetch failed:', e?.message || e);
    }

    if (cfg && (cfg.symbol || cfg.name)) {
      await saveCurrencyConfig(cfg);
      console.log('[CURRENCY:REFRESH] persisted cfg=', cfg);
      return { ...cfg, _digitsMap: digitsMap };
    }
    console.warn('[CURRENCY:REFRESH] fetch returned empty cfg=', cfg);
    return digitsMap ? { _digitsMap: digitsMap } : null;
  } catch (e) {
    console.warn('[CURRENCY:REFRESH] failed:', e?.message || e);
    return null;
  }
}
