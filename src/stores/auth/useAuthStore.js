// stores/auth/login
import { create } from 'zustand';
import { fetchUserApiToken } from '@api/services/generalApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveCurrencyConfig } from '@utils/currency';

// App is locked to Omani Rial regardless of the Odoo company currency.
const APP_CURRENCY = { symbol: 'ر.ع.', name: 'OMR', position: 'before' };

const useAuthStore = create((set) => ({
    isLoggedIn: false,
    user: null,
    currency: null,
    // Initialize store by loading persisted user data
    initializeAuth: async () => {
        try {
            const userData = await AsyncStorage.getItem('userData');
            // Ignore any persisted currency — the app is locked to OMR.
            if (userData) {
                const user = JSON.parse(userData);
                set({ isLoggedIn: true, user, currency: APP_CURRENCY });
                console.log('[AUTH] Restored user session:', user.uid || user.id);
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
        } catch (err) {
            console.error('useAuthStore.login error:', err);
            set((state) => ({ user: { ...(state.user || {}) } }));
        }
    },
    logout: async () => {
        try {
            await AsyncStorage.removeItem('userData');
            await AsyncStorage.removeItem('isLoggedIn');
            // Note: We keep savedCredentials for auto-fill
            console.log('[AUTH] Session cleared');
        } catch (e) {
            console.warn('Failed to clear session', e);
        }
        set({ isLoggedIn: false, user: null });
    },
}));

export default useAuthStore;
