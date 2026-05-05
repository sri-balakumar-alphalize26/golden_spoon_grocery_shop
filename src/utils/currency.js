import AsyncStorage from '@react-native-async-storage/async-storage';

// Default currency configuration
const DEFAULT_CURRENCY = {
  symbol: '$',
  name: 'USD',
  position: 'before',
};

// Get currency configuration from AsyncStorage
export const getCurrencyConfig = async () => {
  try {
    const currencyData = await AsyncStorage.getItem('currencyConfig');
    if (currencyData) {
      return JSON.parse(currencyData);
    }
    return DEFAULT_CURRENCY;
  } catch (error) {
    console.error('[CURRENCY] Failed to get currency config:', error);
    return DEFAULT_CURRENCY;
  }
};

// Save currency configuration to AsyncStorage
export const saveCurrencyConfig = async (currencyConfig) => {
  try {
    await AsyncStorage.setItem('currencyConfig', JSON.stringify(currencyConfig));
    console.log('[CURRENCY] Saved currency config:', currencyConfig);
  } catch (error) {
    console.error('[CURRENCY] Failed to save currency config:', error);
  }
};

// Format amount with currency symbol
// This is a synchronous version that uses a provided currency config
export const formatCurrency = (amount, currencyConfig = DEFAULT_CURRENCY) => {
  if (amount === null || amount === undefined) {
    amount = 0;
  }

  const formattedAmount = parseFloat(amount).toFixed(2);
  const { symbol, position } = currencyConfig;

  if (position === 'after') {
    return `${formattedAmount}${symbol}`;
  } else {
    return `${symbol}${formattedAmount}`;
  }
};

// Format number without currency symbol (for quantities, etc.)
export const formatNumber = (number) => {
  if (number === null || number === undefined) {
    return '0';
  }
  return parseFloat(number).toLocaleString('en-US');
};
