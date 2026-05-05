// src/store/currency/useCurrencyStore.js
import { create } from 'zustand';

const useCurrencyStore = create((set) => ({
    currency: 'AED',
    setCurrency: (packageName) => {
        let newCurrency = 'AED'; 

        if (packageName === process.env.EXPO_PUBLIC_PACKAGE_NAME_OMAN) {
            newCurrency = 'OMR';
        }

        set({ currency: newCurrency });
    },
}));

export default useCurrencyStore;
