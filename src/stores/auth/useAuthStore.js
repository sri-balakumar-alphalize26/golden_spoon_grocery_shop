// stores/auth/login
import { create } from 'zustand';
import { fetchUserApiToken, fetchCompanyCurrency } from '@api/services/generalApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveCurrencyConfig } from '@utils/currency';

const useAuthStore = create((set) => ({
    isLoggedIn: false,
    user: null,
    currency: null,
    // Initialize store by loading persisted user data
    initializeAuth: async () => {
        try {
            const userData = await AsyncStorage.getItem('userData');
            const currencyData = await AsyncStorage.getItem('currencyConfig');

            if (userData) {
                const user = JSON.parse(userData);
                const currency = currencyData ? JSON.parse(currencyData) : null;
                set({ isLoggedIn: true, user, currency });
                console.log('[AUTH] Restored user session:', user.uid || user.id);
                console.log('[AUTH] Restored currency:', currency);
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

            // Fetch and store currency configuration
            try {
                const currencyConfig = await fetchCompanyCurrency();
                set({ currency: currencyConfig });
                await saveCurrencyConfig(currencyConfig);
                console.log('[AUTH] Currency fetched and saved:', currencyConfig);
            } catch (currencyError) {
                console.warn('[AUTH] Failed to fetch currency, using default:', currencyError);
            }

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
