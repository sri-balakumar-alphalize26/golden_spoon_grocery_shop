import AsyncStorage from '@react-native-async-storage/async-storage';

// Neutral fallback — empty symbol so unloaded state shows just the number
// instead of accidentally rendering some random currency. The active
// currency is populated from Odoo after login (see fetchCompanyCurrency)
// and hydrated from AsyncStorage on app boot (see SplashScreen).
const FALLBACK_CURRENCY = { symbol: '', name: '', position: 'before' };

// Module-level cache so formatCurrency(amount) can be called from anywhere
// without prop drilling or hooks. Updated by setActiveCurrency().
let _activeCurrency = FALLBACK_CURRENCY;

// Mirrors Odoo's decimal.precision records: { "Product Price": 3, "Discount": 2, ... }.
// Populated by setActiveDigits — hydrated from AsyncStorage on boot and
// refreshed from Odoo on login / focus.
let _activeDigits = {};

// Tracks which `usage` keys have already been logged via getDigits so we
// emit at most one log line per usage per refresh cycle (lists call
// getDigits hundreds of times per render — naive logging would flood).
// Cleared in setActiveDigits so a fresh fetch re-emits the diagnostic.
const _loggedDigitsUsages = new Set();

export const setActiveDigits = (map) => {
  if (map && typeof map === 'object') {
    _activeDigits = { ...map };
    _loggedDigitsUsages.clear();
    console.log('[CURRENCY:UTIL] setActiveDigits =', _activeDigits, '(usage log cache cleared)');
  } else {
    console.log('[CURRENCY:UTIL] setActiveDigits ignored (invalid map)=', map);
  }
};

export const getActiveDigits = () => _activeDigits;

export const getDigits = (usage, fallback = 2) => {
  const v = _activeDigits?.[usage];
  const resolved = Number.isFinite(v) ? v : fallback;
  if (!_loggedDigitsUsages.has(usage)) {
    _loggedDigitsUsages.add(usage);
    console.log('[CURRENCY:UTIL] getDigits first-resolve usage=', usage, 'value=', resolved, 'fromMap=', Number.isFinite(v));
  }
  return resolved;
};

export const setActiveCurrency = (cfg) => {
  if (cfg && typeof cfg === 'object') {
    _activeCurrency = { ...FALLBACK_CURRENCY, ...cfg };
    console.log('[CURRENCY:UTIL] setActiveCurrency input=', cfg, 'resolved=', _activeCurrency);
  } else {
    console.log('[CURRENCY:UTIL] setActiveCurrency ignored (invalid cfg)=', cfg);
  }
};

export const getActiveCurrency = () => {
  console.log('[CURRENCY:UTIL] getActiveCurrency =', _activeCurrency);
  return _activeCurrency;
};

export const getCurrencyConfig = async () => {
  try {
    const currencyData = await AsyncStorage.getItem('currencyConfig');
    if (currencyData) {
      const parsed = JSON.parse(currencyData);
      console.log('[CURRENCY:UTIL] getCurrencyConfig AsyncStorage read=', parsed);
      setActiveCurrency(parsed);
      return parsed;
    }
    console.log('[CURRENCY:UTIL] getCurrencyConfig no AsyncStorage entry, returning cache=', _activeCurrency);
    return _activeCurrency;
  } catch (error) {
    console.error('[CURRENCY:UTIL] Failed to get currency config:', error);
    return _activeCurrency;
  }
};

export const saveCurrencyConfig = async (currencyConfig) => {
  try {
    await AsyncStorage.setItem('currencyConfig', JSON.stringify(currencyConfig));
    setActiveCurrency(currencyConfig);
    console.log('[CURRENCY:UTIL] saveCurrencyConfig wrote AsyncStorage cfg=', currencyConfig);
  } catch (error) {
    console.error('[CURRENCY:UTIL] Failed to save currency config:', error);
  }
};

export const formatCurrency = (amount, currencyConfig) => {
  if (amount === null || amount === undefined) {
    amount = 0;
  }

  const cfg = currencyConfig || _activeCurrency;
  const digits = getDigits('Product Price', 2);
  const formattedAmount = parseFloat(amount).toFixed(digits);
  const symbol = cfg.symbol || cfg.name || '';
  const position = cfg.position || 'before';

  // Surface when Odoo's dynamic digits override the default — keeps the
  // log signal-only by skipping the common 2-decimal case.
  if (digits !== 2) {
    console.log('[CURRENCY:UTIL] formatCurrency using non-default digits=', digits, 'amount=', amount);
  }

  // Surface the fallback path so we can spot screens that render before
  // currency hydration / Odoo fetch completes.
  if (!symbol) {
    console.log('[CURRENCY:UTIL] formatCurrency rendered WITHOUT symbol — cache empty. amount=', amount, 'cfg=', cfg);
  }

  if (position === 'after') {
    return `${formattedAmount}${symbol ? ' ' + symbol : ''}`;
  }
  return `${symbol}${formattedAmount}`;
};

export const formatNumber = (number) => {
  if (number === null || number === undefined) {
    return '0';
  }
  return parseFloat(number).toLocaleString('en-US');
};
