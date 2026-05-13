// stores/auth/login
import { create } from 'zustand';
import { fetchUserApiToken, fetchHiddenAppFeatures } from '@api/services/generalApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveCurrencyConfig } from '@utils/currency';
import * as Location from 'expo-location';

// App is locked to Omani Rial regardless of the Odoo company currency.
const APP_CURRENCY = { symbol: 'ر.ع.', name: 'OMR', position: 'before' };

// AsyncStorage key for the cached set of hidden app feature keys. Persisting
// it lets the UI render correctly on the very first paint after an app
// restart, before the post-login refresh RPC has finished.
const HIDDEN_FEATURES_KEY = 'hiddenAppFeatures';

const useAuthStore = create((set, get) => ({
    isLoggedIn: false,
    user: null,
    currency: null,
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
            // Ignore any persisted currency — the app is locked to OMR.
            if (userData) {
                const user = JSON.parse(userData);
                set({ isLoggedIn: true, user, currency: APP_CURRENCY });
                console.log('[AUTH] Restored user session:', user.uid || user.id);
                // Fire-and-forget refresh so any role/feature changes made in
                // Odoo since the last login take effect on this app launch.
                const uid = user.uid || user.id;
                if (uid) {
                    get().refreshHiddenFeatures(uid).catch(() => {});
                }
            } else {
                set({ currency: APP_CURRENCY });
            }
        } catch (error) {
            console.error('[AUTH] Failed to restore session:', error);
            set({ currency: APP_CURRENCY });
        }
    },
    // login: accepts a user object (from Odoo or admin) and enriches it with API token(s)
    login: async (userData) => {
        try {
            // Store basic user info from the Odoo login response only.
            set({ isLoggedIn: true, user: userData });
            const enrichedUser = { ...userData };
            set({ user: enrichedUser });

            // App-wide currency is locked to OMR — skip the Odoo fetch.
            set({ currency: APP_CURRENCY });
            await saveCurrencyConfig(APP_CURRENCY);
            console.log('[AUTH] Currency locked to OMR:', APP_CURRENCY);

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
            // Note: We keep savedCredentials for auto-fill
            console.log('[AUTH] Session cleared');
        } catch (e) {
            console.warn('Failed to clear session', e);
        }
        set({ isLoggedIn: false, user: null, hiddenFeatures: new Set() });
    },
}));

export default useAuthStore;
