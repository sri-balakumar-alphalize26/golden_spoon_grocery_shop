// stores/auth/login
import { create } from 'zustand';
import { fetchUserApiToken, fetchHiddenAppFeatures } from '@api/services/generalApi';
import { refreshCurrencyFromStorage } from '@api/services/currencyApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setActiveCurrency, setActiveDigits } from '@utils/currency';
import * as Location from 'expo-location';

// Neutral fallback used until a currency is hydrated from AsyncStorage
// (set on boot) or fetched from Odoo (set after login).
const FALLBACK_CURRENCY = { symbol: '', name: '', position: 'before' };

// AsyncStorage key for the cached set of hidden app feature keys. Persisting
// it lets the UI render correctly on the very first paint after an app
// restart, before the post-login refresh RPC has finished.
const HIDDEN_FEATURES_KEY = 'hiddenAppFeatures';
const COMPANY_PROFILE_KEY = 'companyProfile';

const useAuthStore = create((set, get) => ({
    isLoggedIn: false,
    user: null,
    currency: FALLBACK_CURRENCY,
    decimalAccuracy: {},
    companyProfile: null,
    setCompanyProfile: (profile) => {
        const next = profile && typeof profile === 'object' ? profile : null;
        set({ companyProfile: next });
        // Persist so a relaunch can render the letterhead immediately instead
        // of flashing the "Company" fallback while the live refresh is in
        // flight. Non-fatal on write failure.
        try {
            if (next) {
                AsyncStorage.setItem(COMPANY_PROFILE_KEY, JSON.stringify(next));
            } else {
                AsyncStorage.removeItem(COMPANY_PROFILE_KEY);
            }
        } catch (e) {
            console.warn('[COMPANY] persist failed:', e?.message || e);
        }
    },

    // Re-fetch the Odoo res.users name + login without a logout. Called
    // alongside refreshCompanyProfile so an admin rename of the logged-in
    // user reflects on the receipt's "Cashier: …" line within ~1s.
    refreshUserProfile: async () => {
        try {
            const user = get().user;
            const uid = user?.uid || user?.id;
            if (!uid) return;
            const { fetchUserProfileOdoo } = require('@api/services/generalApi');
            const fresh = await fetchUserProfileOdoo(uid);
            if (!fresh) return;
            const merged = { ...user, name: fresh.name || user?.name, login: fresh.login || user?.login };
            console.log('[USER:REFRESH] merged user =', { name: merged.name, login: merged.login, uid });
            set({ user: merged });
        } catch (e) {
            console.warn('[USER:REFRESH] failed:', e?.message || e);
        }
    },

    // Re-fetch the Odoo res.company letterhead without a logout. Called on
    // app foreground and on focus of every screen that displays the letterhead
    // so an admin edit (company name / address / phone / email) reflects
    // within ~1s instead of requiring a full re-login. Logs at every branch
    // so silent failures (missing companyId, server reject, etc.) are visible.
    refreshCompanyProfile: async () => {
        try {
            const user = get().user;
            if (!user) {
                console.log('[COMPANY:REFRESH] skipped — no user in store');
                return;
            }
            let companyId = Array.isArray(user?.company_id) ? user.company_id[0] : user?.company_id;
            // Odoo 17+ does not return company_id from /web/session/authenticate
            // (we cache only what the response gave us). Fall back to a live
            // res.users.read so refresh still works for those sessions.
            if (!companyId) {
                console.log('[COMPANY:REFRESH] no cached company_id, resolving via res.users.read');
                try {
                    const axios = require('axios').default;
                    const { getOdooUrl } = require('@api/config/odooConfig');
                    const uid = user.uid || user.id;
                    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
                        jsonrpc: '2.0',
                        method: 'call',
                        params: {
                            model: 'res.users',
                            method: 'read',
                            args: [[Number(uid)], ['company_id']],
                            kwargs: {},
                        },
                    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
                    const row = resp.data?.result?.[0];
                    const cid = Array.isArray(row?.company_id) ? row.company_id[0] : row?.company_id;
                    if (cid) {
                        companyId = cid;
                        // Cache it onto the user object so the next refresh skips this hop.
                        set({ user: { ...user, company_id: row.company_id } });
                        console.log('[COMPANY:REFRESH] resolved company_id via res.users.read =', companyId);
                    } else {
                        console.warn('[COMPANY:REFRESH] res.users.read returned no company_id, row =', row);
                    }
                } catch (resolveErr) {
                    console.warn('[COMPANY:REFRESH] company_id resolution failed:', resolveErr?.message || resolveErr);
                }
            }
            if (!companyId) {
                console.warn('[COMPANY:REFRESH] aborting — could not resolve companyId');
                return;
            }
            const { fetchCompanyProfileOdoo } = require('@api/services/generalApi');
            console.log('[COMPANY:REFRESH] fetching res.company id=', companyId);
            const profile = await fetchCompanyProfileOdoo(companyId);
            if (profile) {
                console.log('[COMPANY:REFRESH] new profile =', profile);
                get().setCompanyProfile(profile);
            } else {
                console.warn('[COMPANY:REFRESH] fetchCompanyProfileOdoo returned null');
            }
        } catch (e) {
            console.warn('[COMPANY:REFRESH] failed:', e?.message || e);
        }
    },

    // Set the active currency (called from the post-login Odoo fetch and
    // from boot-time AsyncStorage hydration). Keeps the formatCurrency()
    // module cache in sync so unhooked render paths also pick it up.
    setCurrency: (cfg) => {
        const next = cfg && typeof cfg === 'object' ? { ...FALLBACK_CURRENCY, ...cfg } : FALLBACK_CURRENCY;
        console.log('[CURRENCY:STORE-AUTH] setCurrency input=', cfg, 'next=', next);
        setActiveCurrency(next);
        set({ currency: next });
    },
    setDecimalAccuracy: (map) => {
        const next = map && typeof map === 'object' ? { ...map } : {};
        console.log('[CURRENCY:STORE-AUTH] setDecimalAccuracy input=', map, 'next=', next);
        setActiveDigits(next);
        set({ decimalAccuracy: next });
    },
    // Set of app feature_key strings hidden for the current user. Empty Set
    // means everything is visible. Read by <FeatureGate> via a selector.
    hiddenFeatures: new Set(),

    // Internal: persist + apply a fresh hidden-features list.
    _applyHiddenFeatures: async (keys) => {
        const arr = Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : [];
        set({ hiddenFeatures: new Set(arr) });
        try {
            await AsyncStorage.setItem(HIDDEN_FEATURES_KEY, JSON.stringify(arr));
        } catch (e) {
            // Persistence is an optimization (avoids first-paint flash on relaunch);
            // a write failure is non-fatal — the in-memory Set is already updated.
            console.warn('[AUTH] Failed to persist hiddenFeatures:', e?.message || e);
        }
    },

    // Refresh the hidden-features set from Odoo for a given uid.
    refreshHiddenFeatures: async (uid) => {
        if (!uid) return;
        const keys = await fetchHiddenAppFeatures(uid);
        await get()._applyHiddenFeatures(keys);
        console.log(`[AUTH] hiddenFeatures refreshed: ${keys.length} key(s): [${keys.join(', ')}]`);
    },

    // Initialize store by loading persisted user data
    initializeAuth: async () => {
        console.log('[CURRENCY:STORE-AUTH] initializeAuth called');
        try {
            const userData = await AsyncStorage.getItem('userData');
            // Hydrate the hidden-features cache eagerly so gated UI doesn't
            // flash visible during the brief window before refreshHiddenFeatures
            // resolves over the network.
            try {
                const cached = await AsyncStorage.getItem(HIDDEN_FEATURES_KEY);
                if (cached) {
                    const arr = JSON.parse(cached);
                    if (Array.isArray(arr)) set({ hiddenFeatures: new Set(arr) });
                }
            } catch (e) {
                // Ignore — defaults to empty set (everything visible).
            }
            // Hydrate currency from AsyncStorage (saved after the last
            // successful login by LoginScreenOdoo). Falls back to the
            // empty currency if nothing has been saved yet.
            try {
                const rawCurrency = await AsyncStorage.getItem('currencyConfig');
                console.log('[CURRENCY:STORE-AUTH] initializeAuth AsyncStorage currencyConfig raw=', rawCurrency);
                if (rawCurrency) {
                    const cfg = JSON.parse(rawCurrency);
                    console.log('[CURRENCY:STORE-AUTH] initializeAuth hydrating cfg=', cfg);
                    get().setCurrency(cfg);
                } else {
                    console.log('[CURRENCY:STORE-AUTH] initializeAuth no AsyncStorage entry — staying on FALLBACK');
                }
            } catch (e) {
                console.warn('[CURRENCY:STORE-AUTH] initializeAuth hydrate error:', e?.message || e);
            }
            // Hydrate the cached Odoo company letterhead so the receipt
            // header renders immediately on relaunch instead of flashing the
            // "Company" fallback while refreshCompanyProfile runs.
            try {
                const rawProfile = await AsyncStorage.getItem(COMPANY_PROFILE_KEY);
                if (rawProfile) {
                    const profile = JSON.parse(rawProfile);
                    if (profile && typeof profile === 'object') {
                        set({ companyProfile: profile });
                        console.log('[COMPANY] hydrated profile from AsyncStorage =', profile);
                    }
                }
            } catch (e) {
                console.warn('[COMPANY] hydrate error:', e?.message || e);
            }
            // Hydrate decimal.precision map (saved alongside currencyConfig
            // on the most recent refresh / login). Falls back to {} on miss.
            try {
                const rawDigits = await AsyncStorage.getItem('decimalAccuracy');
                console.log('[CURRENCY:STORE-AUTH] initializeAuth AsyncStorage decimalAccuracy raw=', rawDigits);
                if (rawDigits) {
                    const map = JSON.parse(rawDigits);
                    if (map && typeof map === 'object') get().setDecimalAccuracy(map);
                }
            } catch (e) {
                console.warn('[CURRENCY:STORE-AUTH] initializeAuth digits hydrate error:', e?.message || e);
            }

            if (userData) {
                const user = JSON.parse(userData);
                set({ isLoggedIn: true, user });
                console.log('[AUTH] Restored user session:', user.uid || user.id);
                // Fire-and-forget refresh so any role/feature changes made in
                // Odoo since the last login take effect on this app launch.
                const uid = user.uid || user.id;
                if (uid) {
                    get().refreshHiddenFeatures(uid).catch(() => {});
                }
                // Refresh currency from Odoo so server-side changes (e.g.
                // switching the company currency) propagate without
                // requiring a logout + re-login. Fire-and-forget.
                refreshCurrencyFromStorage()
                    .then((cfg) => { if (cfg) get().setCurrency(cfg); })
                    .catch(() => {});
                // Refresh letterhead + user display name from Odoo on launch
                // so an admin edit (company rename / user rename) made while
                // the app was closed reflects on the next receipt without a
                // logout. Fire-and-forget.
                get().refreshCompanyProfile?.().catch(() => {});
                get().refreshUserProfile?.().catch(() => {});
            }
        } catch (error) {
            console.error('[AUTH] Failed to restore session:', error);
        }
    },
    // login: accepts a user object (from Odoo or admin) and enriches it with API token(s)
    login: async (userData) => {
        try {
            // Store basic user info from the Odoo login response only.
            set({ isLoggedIn: true, user: userData });
            const enrichedUser = { ...userData };
            set({ user: enrichedUser });

            // Currency is fetched from Odoo by LoginScreenOdoo after a
            // successful authenticate (see fetchCompanyCurrency). The
            // result is persisted to AsyncStorage `currencyConfig` and
            // pushed into this store via setCurrency(). Don't override
            // it here.

            try {
                await AsyncStorage.setItem('userData', JSON.stringify(enrichedUser));
                await AsyncStorage.setItem('isLoggedIn', 'true');
                console.log('[AUTH] Session persisted');
            } catch (e) {
                console.warn('Failed to persist userData', e);
            }

            // Fetch the hidden-features set right after login. Fire-and-forget
            // so login latency is unaffected; FeatureGate falls back to "show"
            // until the response lands.
            const uid = enrichedUser.uid || enrichedUser.id;
            if (uid) {
                get().refreshHiddenFeatures(uid).catch(() => {});
            }

            // Ask for location permission once per install. The captured GPS
            // is used when validating a POS payment (see captureAndStoreOrderLocation
            // in generalApi.js). Cached via AsyncStorage so returning users
            // don't see the prompt again. Failure is swallowed so login itself
            // is unaffected. If the user revokes permission later, the per-
            // action prompts in POSPayment / captureAndStoreOrderLocation
            // surface the OS prompt as a fallback.
            try {
                const asked = await AsyncStorage.getItem('locationPermissionAsked');
                if (!asked) {
                    await Location.requestForegroundPermissionsAsync();
                    await AsyncStorage.setItem('locationPermissionAsked', '1');
                    console.log('[POSLocation] first-login permission requested');
                }
            } catch (e) {
                console.warn('[POSLocation] login-time permission request failed:', e?.message || e);
            }
        } catch (err) {
            console.error('useAuthStore.login error:', err);
            set((state) => ({ user: { ...(state.user || {}) } }));
        }
    },
    logout: async () => {
        try {
            await AsyncStorage.removeItem('userData');
            await AsyncStorage.removeItem('isLoggedIn');
            await AsyncStorage.removeItem(HIDDEN_FEATURES_KEY);
            await AsyncStorage.removeItem(COMPANY_PROFILE_KEY);
            // Note: We keep savedCredentials for auto-fill
            console.log('[AUTH] Session cleared');
        } catch (e) {
            console.warn('Failed to clear session', e);
        }
        set({ isLoggedIn: false, user: null, hiddenFeatures: new Set(), companyProfile: null });
    },
}));

export default useAuthStore;
