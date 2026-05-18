import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Modal,
  Dimensions,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { BarChart } from 'react-native-chart-kit';
import { NavigationHeader } from '@components/Header';
import {
  fetchSalesReportData,
  fetchTopProducts,
  fetchPaymentMethods,
  fetchSalesProfitOdoo,
  fetchOperatingExpensesOdoo,
  fetchOrderLinesForProduct,
} from '@api/services/generalApi';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency as formatCurrencyUtil, formatNumber } from '@utils/currency';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

// Android requires explicit opt-in for LayoutAnimation in newer RN versions.
// Calling setLayoutAnimationEnabledExperimental once at module load is enough.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'dashboard' },
  { key: 'products', label: 'Top Products', icon: 'shopping-cart' },
  { key: 'customers', label: 'Top Customers', icon: 'people' },
  { key: 'payments', label: 'Payments', icon: 'payment' },
  { key: 'pnl', label: 'P&L', icon: 'trending-up' },
];

// Odoo-style Filters dropdown (multi-select). The Order Date row is itself
// expandable in the UI — its children are mutually exclusive date presets
// (only one can be active at a time). Custom Range lives inside Order Date,
// so there's no separate top-level "Custom Filter…" row.
const FILTER_OPTIONS = [
  { key: 'invoiced',      type: 'leaf', label: 'Invoiced' },
  { key: 'not_invoiced',  type: 'leaf', label: 'Not Invoiced' },
  { key: 'not_cancelled', type: 'leaf', label: 'Not Cancelled' },
  {
    key: 'order_date',
    type: 'expandable',
    label: 'Order Date',
    children: [
      { key: 'date:today',  label: 'Today'        },
      { key: 'date:7d',     label: 'Last 7 Days'  },
      { key: 'date:30d',    label: 'Last 30 Days' },
      { key: 'date:month',  label: 'This Month'   },
      { key: 'date:year',   label: 'This Year'    },
      { key: 'date:custom', label: 'Custom Range…', opensCalendar: true },
    ],
  },
];

// Flat lookup so chips / exports can resolve a date:* key to its human label
// without walking the nested children every time.
const DATE_FILTER_LABELS = FILTER_OPTIONS
  .find((o) => o.key === 'order_date')
  .children.reduce((acc, c) => { acc[c.key] = c.label; return acc; }, {});

// Odoo-style Group By dropdown. `applicableTabs` hides options that don't
// make sense for the current tab (e.g. Product on the Payments tab). Customer
// grouping is intentionally excluded per product spec. Order Date is expandable
// into 5 mutually-exclusive granularity choices.
const GROUPBY_OPTIONS = [
  { key: 'user',             type: 'leaf', label: 'User',             applicableTabs: ['overview', 'customers', 'payments'] },
  { key: 'employee',         type: 'leaf', label: 'Employee',         applicableTabs: ['overview', 'customers', 'payments'] },
  { key: 'config',           type: 'leaf', label: 'Point of Sale',    applicableTabs: ['overview', 'customers', 'payments'] },
  { key: 'product',          type: 'leaf', label: 'Product',          applicableTabs: ['overview', 'products'] },
  { key: 'product_category', type: 'leaf', label: 'Product Category', applicableTabs: ['overview', 'products'] },
  { key: 'payment_method',   type: 'leaf', label: 'Payment Method',   applicableTabs: ['overview', 'payments'] },
  { key: 'pos_categ',        type: 'leaf', label: 'POS Category',     applicableTabs: ['overview', 'products'] },
  {
    key: 'order_date',
    type: 'expandable',
    label: 'Order Date',
    applicableTabs: ['overview', 'customers', 'payments', 'products'],
    children: [
      { key: 'order_date:year',    label: 'Year'    },
      { key: 'order_date:quarter', label: 'Quarter' },
      { key: 'order_date:month',   label: 'Month'   },
      { key: 'order_date:week',    label: 'Week'    },
      { key: 'order_date:day',     label: 'Day'     },
    ],
  },
];

const ORDER_DATE_GROUP_LABELS = GROUPBY_OPTIONS
  .find((o) => o.key === 'order_date')
  .children.reduce((acc, c) => { acc[c.key] = c.label; return acc; }, {});

const VIEW_MODES = [
  { key: 'list',  icon: 'view-list',  label: 'List'  },
  { key: 'graph', icon: 'bar-chart',  label: 'Graph' },
  { key: 'pivot', icon: 'grid-on',    label: 'Pivot' },
];

// Measures the user can pick for the pivot's column dimension. `requiresQty`
// means the measure only makes sense when the active grouping carries qty
// (currently: product-style groupings via topProducts). Tax intentionally
// excluded from the Sales Report.
const MEASURES = [
  { key: 'orderCount', label: 'Order',            type: 'number' },
  { key: 'qty',        label: 'Product Quantity', type: 'number', requiresQty: true },
  { key: 'totalSales', label: 'Total Price',      type: 'money' },
  { key: 'avgOrder',   label: 'Average Price',    type: 'money' },
];

// Pull the single active date:* / order_date:* key out of an array — only one
// can be active at a time (enforced by the toggle handlers).
const getDateFilterKey = (filters) => (filters || []).find((k) => typeof k === 'string' && k.startsWith('date:')) || null;
const getDateGroupKey  = (groups)  => (groups  || []).find((k) => typeof k === 'string' && k.startsWith('order_date:')) || null;

// Date-bucket helpers for the Order Date group-by. ISO-week uses the standard
// "Thursday wins" rule (RFC 5545 / ISO 8601) so weeks line up with what Odoo
// produces.
const dayBucket = (iso) => {
  if (!iso) return 'Unknown';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(iso).slice(0, 10);
};
const monthBucket = (iso) => {
  if (!iso) return 'Unknown';
  const m = String(iso).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : 'Unknown';
};
const yearBucket = (iso) => {
  if (!iso) return 'Unknown';
  const m = String(iso).match(/^(\d{4})/);
  return m ? m[1] : 'Unknown';
};
const quarterBucket = (iso) => {
  if (!iso) return 'Unknown';
  const m = String(iso).match(/^(\d{4})-(\d{2})/);
  if (!m) return 'Unknown';
  const month = Number(m[2]);
  const q = Math.floor((month - 1) / 3) + 1;
  return `${m[1]}-Q${q}`;
};
const weekBucket = (iso) => {
  if (!iso) return 'Unknown';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 'Unknown';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Shift to Thursday in the same week so year boundary aligns with ISO weeks.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};
const dateBucketFor = (iso, granularity) => {
  switch (granularity) {
    case 'year':    return yearBucket(iso);
    case 'quarter': return quarterBucket(iso);
    case 'month':   return monthBucket(iso);
    case 'week':    return weekBucket(iso);
    case 'day':
    default:        return dayBucket(iso);
  }
};

// Aggregate the salesData.orders array by the first selected group-by key.
// `groupBy` can be 'user' | 'employee' | 'config' or one of the prefixed
// 'order_date:<granularity>' keys. Always emits the same shape so the
// Graph/Pivot renderers don't care which grouping was chosen.
const aggregateOrders = (orders, groupBy) => {
  if (!groupBy || !Array.isArray(orders) || orders.length === 0) return [];
  const isDate = typeof groupBy === 'string' && groupBy.startsWith('order_date:');
  const granularity = isDate ? groupBy.split(':')[1] : null;
  const map = new Map();
  const tupleName = (v) => Array.isArray(v) ? v[1] : null;
  const tupleId   = (v) => Array.isArray(v) ? v[0] : null;

  orders.forEach((o) => {
    let key = null;
    let label = null;
    if (isDate) {
      key = dateBucketFor(o.date_order, granularity);
      label = key;
    } else {
      switch (groupBy) {
        case 'user':
          key = tupleId(o.user_id) || 'unassigned';
          label = tupleName(o.user_id) || 'Unassigned';
          break;
        case 'employee':
          key = tupleId(o.employee_id) || 'unassigned';
          label = tupleName(o.employee_id) || 'Unassigned';
          break;
        case 'config':
          key = tupleId(o.config_id) || tupleId(o.session_id) || 'unknown';
          label = tupleName(o.config_id) || tupleName(o.session_id) || 'Unknown POS';
          break;
        default:
          return; // unsupported group-by for raw orders (handled elsewhere)
      }
    }
    const cur = map.get(key) || { key, label, totalSales: 0, orderCount: 0, tax: 0 };
    cur.totalSales += Number(o.amount_total) || 0;
    cur.orderCount += 1;
    cur.tax += Number(o.amount_tax) || 0;
    map.set(key, cur);
  });

  const rows = [...map.values()].map((r) => ({
    ...r,
    avgOrder: r.orderCount > 0 ? r.totalSales / r.orderCount : 0,
  }));

  // Order Date stays chronological; everything else descends by total.
  if (isDate) {
    rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  } else {
    rows.sort((a, b) => b.totalSales - a.totalSales);
  }
  return rows;
};

// Truncate long graph-axis labels — chart-kit can't rotate.
const truncLabel = (s, n = 8) => {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
};

const isoDateOnly = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const SalesReportScreen = ({ navigation }) => {
  const currency = useAuthStore((state) => state.currency);
  const decimalAccuracy = useAuthStore((state) => state.decimalAccuracy);
  useEffect(() => { console.log('[CURRENCY:RENDER] SalesReportScreen', currency); }, [currency]);
  useEffect(() => { console.log('[CURRENCY:RENDER] SalesReportScreen decimalAccuracy=', decimalAccuracy); }, [decimalAccuracy]);
  const fallbackCurrency = { symbol: '', name: '', position: 'before' };

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [salesData, setSalesData] = useState(null);
  const [previousSummary, setPreviousSummary] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [opex, setOpex] = useState(0);

  // Custom date range — only used when the active date filter is `date:custom`,
  // set either from Filters > Order Date > Custom Range… or from the top-level
  // Custom Filter… action row. Both paths funnel through the same calendar.
  const todayStr = isoDateOnly(new Date());
  const [customStart, setCustomStart] = useState(todayStr);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [calendarOpen, setCalendarOpen] = useState(null); // 'from' | 'to' | null

  // Export state
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);

  // Odoo-style filter / group-by / view-mode state. Multi-select for the first
  // two (matches Odoo). Only the first selected group-by is honoured by the
  // graph/pivot renderers in v1 — nesting groupings is out of scope.
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [selectedGroupBys, setSelectedGroupBys] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [menuOpen, setMenuOpen] = useState(null); // 'filter' | 'group' | null
  // Top-level mode tab. Overview = the dashboard. Analysis = the
  // Odoo-style filters/group-by/pivot/graph workspace.
  const [pageMode, setPageMode] = useState('overview'); // 'overview' | 'analysis'
  // Pivot-specific controls (Analysis mode only): which measure columns to
  // show, and whether to flip rows↔columns. Both reset whenever the user
  // re-enters Analysis mode so each entry starts clean. Default to the three
  // visible columns in Odoo's Orders Analysis pivot (Order / Qty / Total Price).
  const [selectedMeasures, setSelectedMeasures] = useState(['orderCount', 'qty', 'totalSales']);
  const [flipAxis, setFlipAxis] = useState(false);

  // Drill-down Modal state for "tap an Order count → see the underlying orders".
  const [drillProduct, setDrillProduct] = useState(null); // { id, name } | null
  const [drillOrders, setDrillOrders] = useState(null);   // null=loading, []=loaded
  // Which expandable section (e.g. 'order_date') is open inside the menu.
  // Reset whenever the menu opens so navigation always starts collapsed.
  const [menuExpandedKey, setMenuExpandedKey] = useState(null);

  const hasLoadedRef = useRef(false);

  const fmtDt = (d) => {
    if (!d) return null;
    const y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${M}-${D} ${h}:${m}:${s}`;
  };
  const parseIsoDate = (s) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // Resolve a `date:*` filter key (or null = All Time) to a concrete Odoo
  // date_order range. Returns { startDate: null, endDate: null } for All Time,
  // which the API treats as "no domain constraint on date".
  const getDateRange = (dateKey) => {
    if (!dateKey) return { startDate: null, endDate: null };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    switch (dateKey) {
      case 'date:today':
        return { startDate: fmtDt(today), endDate: fmtDt(endOfToday) };
      case 'date:7d': {
        const s = new Date(today); s.setDate(today.getDate() - 7);
        return { startDate: fmtDt(s), endDate: fmtDt(endOfToday) };
      }
      case 'date:30d': {
        const s = new Date(today); s.setDate(today.getDate() - 30);
        return { startDate: fmtDt(s), endDate: fmtDt(endOfToday) };
      }
      case 'date:month': {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: fmtDt(s), endDate: fmtDt(endOfToday) };
      }
      case 'date:year': {
        const s = new Date(now.getFullYear(), 0, 1);
        return { startDate: fmtDt(s), endDate: fmtDt(endOfToday) };
      }
      case 'date:custom': {
        const s = parseIsoDate(customStart);
        const e = parseIsoDate(customEnd);
        if (!s || !e) return { startDate: null, endDate: null };
        const eEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59);
        return { startDate: fmtDt(s), endDate: fmtDt(eEnd) };
      }
      default:
        return { startDate: null, endDate: null };
    }
  };

  // Previous-period range, same length as the current date filter. Used by the
  // delta badge ("+12% vs prev"). No date filter → no comparison.
  const getPreviousRange = (dateKey) => {
    if (!dateKey) return { startDate: null, endDate: null, label: '' };
    const cur = getDateRange(dateKey);
    if (!cur.startDate || !cur.endDate) return { startDate: null, endDate: null, label: '' };
    const curStart = new Date(cur.startDate.replace(' ', 'T'));
    const curEnd = new Date(cur.endDate.replace(' ', 'T'));
    const lengthMs = curEnd.getTime() - curStart.getTime();
    const prevEnd = new Date(curStart.getTime() - 1000);
    const prevStart = new Date(prevEnd.getTime() - lengthMs);
    return {
      startDate: fmtDt(prevStart),
      endDate: fmtDt(prevEnd),
      label: 'vs previous',
    };
  };

  const fetchReportData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const dateKey = getDateFilterKey(selectedFilters);
      const range = getDateRange(dateKey);
      const prev = getPreviousRange(dateKey);
      // Only the non-date filters reach the Odoo domain — `date:*` keys are
      // already encoded into the range above.
      const domainFilters = selectedFilters.filter((k) => !String(k).startsWith('date:'));
      // The previous-period fetch deliberately omits `filters` so the
      // delta-vs-prev badge in the hero stays a clean baseline; otherwise the
      // % swing would be a comparison of differently-filtered universes.
      // In Analysis mode the pivot needs every product (not a top-10 slice),
      // so request the full set. Overview / dashboard keeps the top-N.
      const productsArgs = pageMode === 'analysis'
        ? { ...range, full: true }
        : { ...range, limit: 10 };
      const [sales, products, payments, prevSales, profit, opexTotal] = await Promise.all([
        fetchSalesReportData({ ...range, filters: domainFilters }),
        fetchTopProducts(productsArgs),
        fetchPaymentMethods(range),
        prev.startDate
          ? fetchSalesReportData({ startDate: prev.startDate, endDate: prev.endDate })
          : Promise.resolve(null),
        fetchSalesProfitOdoo(range),
        fetchOperatingExpensesOdoo(range),
      ]);
      setSalesData(sales);
      setTopProducts(products || []);
      setPaymentMethods(payments || []);
      setPreviousSummary(prevSales?.summary || null);
      setPnl(profit || null);
      setOpex(Number(opexTotal?.total) || 0);
    } catch (e) {
      console.error('Sales report fetch failed:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!hasLoadedRef.current) {
      fetchReportData();
      hasLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) {
      // Soft refetch — keep the existing body visible while the new data
      // loads so the filter-change feels like a smooth update rather than a
      // full reload. The hero / pivot will simply re-render once data lands.
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      fetchReportData(false);
    }
    // Refire when any filter (incl. the date:* key) changes, or when the user
    // edits the custom range inputs. pageMode also triggers a refetch so the
    // product fetch can switch between top-10 (Overview) and full (Analysis).
  }, [customStart, customEnd, selectedFilters, pageMode]);

  // Animate layout when filters/groupings/mode change — softens chip strip
  // appearance and the Overview <-> Analysis body swap.
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [selectedGroupBys, pageMode, viewMode]);

  // Never let the user end up with zero measures selected — the table would
  // collapse to nothing. Coerce back to the default if they deselect everything.
  useEffect(() => {
    if (selectedMeasures.length === 0) setSelectedMeasures(['orderCount', 'qty', 'totalSales']);
  }, [selectedMeasures]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReportData(false);
  }, [selectedFilters, customStart, customEnd]);

  const fmtMoney = (n) => formatCurrencyUtil(n || 0, currency || fallbackCurrency);

  // Active date filter key + human label for chips / exports / hero.
  const activeDateKey = getDateFilterKey(selectedFilters);
  const dateRangeLabel = activeDateKey
    ? (activeDateKey === 'date:custom'
        ? `${customStart} → ${customEnd}`
        : DATE_FILTER_LABELS[activeDateKey] || 'Custom')
    : 'All Time';

  // Human label for the active section/tab — shown inline on the Section pill.
  const sectionLabel = (TABS.find((t) => t.key === selectedTab) || TABS[0]).label;

  // Switching pageMode resets filter/group-by + pivot controls so each mode
  // lands in a clean slate. Analysis mode also coerces 'list' to 'pivot' since
  // List isn't available there.
  const setPageModeSafe = (next) => {
    if (next === pageMode) return;
    setSelectedFilters([]);
    setSelectedGroupBys([]);
    setSelectedMeasures(['orderCount', 'qty', 'totalSales']);
    setFlipAxis(false);
    if (next === 'analysis' && viewMode === 'list') setViewMode('pivot');
    setPageMode(next);
  };

  // The active group-by is whichever string the user picked first. For Order
  // Date the key carries its granularity suffix (e.g. 'order_date:month');
  // pass it straight through to aggregateOrders.
  const activeGroupBy = selectedGroupBys[0] || null;

  // When the user is in Pivot/Graph view without picking a Group By, fall back
  // to a sensible default per section (matches Odoo's Orders Analysis: applying
  // a filter alone still produces a useful pivot). '_customers' is a private
  // sentinel — never appears in selectedGroupBys, the Group By menu, chips, or
  // exports; it just lets the Customers section reuse the existing topCustomers
  // memo. P&L returns null so its ledger view keeps the "Pick a Group By"
  // placeholder, which is the right behaviour for that section.
  const SECTION_FALLBACK_GROUPBY = {
    overview:  'order_date:day',
    products:  'product',
    customers: '_customers',
    payments:  'payment_method',
    pnl:       null,
  };
  // In Analysis mode the dropdown is cross-section, so fallback is always
  // Product (mirrors Odoo's Orders Analysis default — rows are product names,
  // not date buckets) unless the user picks an explicit Group By. In Overview
  // mode the fallback follows the active section pill.
  const fallbackGroupBy = pageMode === 'analysis'
    ? 'product'
    : (SECTION_FALLBACK_GROUPBY[selectedTab] || null);
  const effectiveGroupBy = activeGroupBy || fallbackGroupBy;

  // The set of group-by options that make sense for the currently active tab.
  // Used by the Group By menu to hide nonsensical combos (e.g. Product on Payments).
  const groupByOptionsForTab = useMemo(() => (
    GROUPBY_OPTIONS.filter((g) => g.applicableTabs.includes(selectedTab))
  ), [selectedTab]);

  // Rows for Graph/Pivot views. Pulls from already-fetched topProducts /
  // paymentMethods when the grouping matches them, otherwise aggregates the
  // raw orders list. Always returns the same { key, label, totalSales,
  // orderCount, avgOrder, tax } row shape so renderers stay simple.
  // Top Customers — aggregate from salesData.orders by partner_id.
  const topCustomers = useMemo(() => {
    const orders = salesData?.orders || [];
    const map = new Map();
    orders.forEach((o) => {
      const pid = Array.isArray(o.partner_id) ? o.partner_id[0] : null;
      const pname = Array.isArray(o.partner_id) ? o.partner_id[1] : null;
      if (!pid || !pname) return; // skip walk-ins (no customer attached)
      const cur = map.get(pid) || { id: pid, name: pname, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(o.amount_total) || 0;
      map.set(pid, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [salesData]);

  const groupedRows = useMemo(() => {
    if (!effectiveGroupBy) return [];
    if (effectiveGroupBy === 'product' || effectiveGroupBy === 'product_category' || effectiveGroupBy === 'pos_categ') {
      // Reuse the existing top-products aggregation. Product Category / POS
      // Category buckets aren't a separate Odoo call here — they degrade to
      // per-product rows. Good enough for v1; a true category aggregation
      // can be added later if the user asks for it.
      // orderCount = distinct order_id count per product (matches Odoo's
      // "Order" column in Orders Analysis). Note: the Total row sums these
      // per-product counts, which double-counts orders that contain multiple
      // products — same arithmetic Odoo's pivot uses.
      return (topProducts || []).map((p) => ({
        key: p.id ?? p.name,
        label: p.name || 'Unknown',
        totalSales: Number(p.revenue) || 0,
        orderCount: Number(p.order_count) || 0,
        avgOrder: (Number(p.order_count) || 0) > 0
          ? (Number(p.revenue) || 0) / (Number(p.order_count) || 1)
          : 0,
        tax: 0,
        qty: Number(p.quantity) || 0,
      }));
    }
    if (effectiveGroupBy === 'payment_method') {
      return (paymentMethods || []).map((m) => ({
        key: m.id ?? m.name,
        label: m.name || 'Unknown',
        totalSales: Number(m.total) || 0,
        orderCount: Number(m.count) || 0,
        avgOrder: 0,
        tax: 0,
      }));
    }
    if (effectiveGroupBy === '_customers') {
      // Private sentinel for the Customers section fallback — reuses the
      // existing topCustomers memo. Never appears in selectedGroupBys/chips.
      return (topCustomers || []).map((c) => ({
        key: c.id,
        label: c.name || 'Unknown',
        totalSales: Number(c.total) || 0,
        orderCount: Number(c.count) || 0,
        avgOrder: c.count > 0 ? (Number(c.total) || 0) / c.count : 0,
        tax: 0,
      }));
    }
    // user / employee / config / order_date:<granularity> all flow through
    // aggregateOrders which understands prefixed keys.
    return aggregateOrders(salesData?.orders || [], effectiveGroupBy);
  }, [effectiveGroupBy, salesData, topProducts, paymentMethods, topCustomers]);

  // Resolve any group-by key (incl. order_date:<granularity>) to a friendly
  // label for the active-chips strip, pivot header, and export captions.
  const groupLabelFor = (key) => {
    if (!key) return '';
    if (key === '_customers') return 'Customer';
    if (key.startsWith('order_date:')) {
      return `Order Date · ${ORDER_DATE_GROUP_LABELS[key] || key.split(':')[1]}`;
    }
    const flat = GROUPBY_OPTIONS.find((g) => g.key === key);
    return flat?.label || key;
  };

  // % delta vs previous period for the Total Sales hero.
  const totalDelta = useMemo(() => {
    const cur = Number(salesData?.summary?.totalSales) || 0;
    const prev = Number(previousSummary?.totalSales) || 0;
    if (!previousSummary) return null;
    if (prev === 0) {
      if (cur === 0) return { pct: 0, dir: 'flat' };
      return { pct: 100, dir: 'up' };
    }
    const pct = ((cur - prev) / prev) * 100;
    return {
      pct: Math.abs(pct),
      dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat',
    };
  }, [salesData, previousSummary]);

  // ───── Export helpers ─────
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
  const csvEscape = (s) => {
    const str = String(s ?? '');
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const tsForFile = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  // Self-describing chip strings for exports — keeps the PDF/CSV honest about
  // what state the page was in when the user hit Download.
  const exportFilterLabel = () => (
    selectedFilters.length === 0
      ? 'None'
      : selectedFilters.map((k) => FILTER_OPTIONS.find((o) => o.key === k)?.label || k).join(', ')
  );
  const exportGroupLabel = () => (
    selectedGroupBys.length === 0
      ? 'None'
      : selectedGroupBys.map((k) => GROUPBY_OPTIONS.find((o) => o.key === k)?.label || k).join(', ')
  );
  const exportViewLabel = () => (VIEW_MODES.find((m) => m.key === viewMode)?.label || 'List');

  const buildHtml = () => {
    const summary = salesData?.summary || {};
    const rangeLabel = dateRangeLabel;
    const tabLabel = (TABS.find((t) => t.key === selectedTab) || TABS[0]).label;
    const head = `
      <div style="margin-bottom:18px;">
        <div style="font-size:22px;font-weight:800;color:#2E294E;letter-spacing:0.3px;">Sales Report — ${escapeHtml(rangeLabel)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">Generated: ${escapeHtml(new Date().toLocaleString('en-US'))}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">Mode: <b>${escapeHtml(pageMode === 'analysis' ? 'Filters & Group By' : 'Overview')}</b> · View: <b>${escapeHtml(exportViewLabel())}</b> · Tab: <b>${escapeHtml(tabLabel)}</b> · Filters: <b>${escapeHtml(exportFilterLabel())}</b> · Group By: <b>${escapeHtml(exportGroupLabel())}</b></div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
        <tr>
          <td style="padding:8px 10px;background:#fafbfc;border:1px solid #eef0f5;"><b>Total Sales</b><br/>${escapeHtml(fmtMoney(summary.totalSales))}</td>
          <td style="padding:8px 10px;background:#fafbfc;border:1px solid #eef0f5;"><b>Orders</b><br/>${formatNumber(summary.totalOrders || 0)}</td>
          <td style="padding:8px 10px;background:#fafbfc;border:1px solid #eef0f5;"><b>Avg Order</b><br/>${escapeHtml(fmtMoney(summary.averageOrder))}</td>
        </tr>
      </table>
    `;
    const productsRows = (topProducts || []).map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td style="text-align:right;">${formatNumber(p.quantity)}</td>
        <td style="text-align:right;">${escapeHtml(fmtMoney(p.revenue))}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:14px;">No product sales</td></tr>';

    const customersRows = (topCustomers || []).map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(c.name)}</td>
        <td style="text-align:right;">${formatNumber(c.count)}</td>
        <td style="text-align:right;">${escapeHtml(fmtMoney(c.total))}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:14px;">No customer-attributed sales</td></tr>';

    const totalPayments = (paymentMethods || []).reduce((s, m) => s + (Number(m.total) || 0), 0);
    const paymentRows = (paymentMethods || []).map((m) => {
      const pct = totalPayments > 0 ? ((Number(m.total) || 0) / totalPayments) * 100 : 0;
      return `
        <tr>
          <td>${escapeHtml(m.name)}</td>
          <td style="text-align:right;">${formatNumber(m.count)}</td>
          <td style="text-align:right;">${escapeHtml(fmtMoney(m.total))}</td>
          <td style="text-align:right;">${pct.toFixed(1)}%</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:14px;">No payments</td></tr>';

    const tableStyle = `width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px;`;
    const thStyle = `background:#2E294E;color:#fff;padding:8px 10px;text-align:left;font-size:10px;letter-spacing:0.5px;text-transform:uppercase;`;
    const tdStyle = `padding:8px 10px;border-bottom:1px solid #eef0f5;`;

    const _rev = Number(pnl?.revenue) || 0;
    const _cogs = Number(pnl?.cogs) || 0;
    const _gp = Number(pnl?.gross_profit) || (_rev - _cogs);
    const _gpPct = _rev > 0 ? (_gp / _rev) * 100 : 0;
    const _opex = Number(opex) || 0;
    const _net = _gp - _opex;
    const _netPct = _rev > 0 ? (_net / _rev) * 100 : 0;
    const pnlSection = `
      <h2>Profit &amp; Loss</h2>
      <table style="${tableStyle}"><tbody>
        <tr><td>Revenue</td><td style="text-align:right;">${escapeHtml(fmtMoney(_rev))}</td></tr>
        <tr><td>− Cost of Goods Sold</td><td style="text-align:right;">${escapeHtml(fmtMoney(_cogs))}</td></tr>
        <tr style="background:#fef3c7;"><td><b>Gross Profit (${_gpPct.toFixed(1)}%)</b></td><td style="text-align:right;"><b>${escapeHtml(fmtMoney(_gp))}</b></td></tr>
        <tr><td>− Operating Expenses</td><td style="text-align:right;">${escapeHtml(fmtMoney(_opex))}</td></tr>
        <tr style="background:#dcfce7;"><td><b>Net Profit (${_netPct.toFixed(1)}%)</b></td><td style="text-align:right;"><b>${escapeHtml(fmtMoney(_net))}</b></td></tr>
      </tbody></table>
    `;
    // Pivot / Graph view: emit a single grouped table that reflects whatever
    // measures / flip-axis the user picked. Graph view falls back to a numeric
    // table (PDF can't host a live chart).
    let bodyHtml;
    if (pageMode === 'analysis') {
      const groupLabel = groupLabelFor(effectiveGroupBy) || 'Group';
      const hasQtyExp = (groupedRows || []).some((r) => typeof r.qty === 'number');
      const measuresExp = MEASURES.filter((m) =>
        selectedMeasures.includes(m.key) && (!m.requiresQty || hasQtyExp)
      );
      const fmtM = (val, type) => type === 'money' ? fmtMoney(val || 0) : formatNumber(val || 0);
      const totalsExp = measuresExp.reduce((acc, m) => {
        acc[m.key] = (groupedRows || []).reduce((s, r) => s + (Number(r[m.key]) || 0), 0);
        return acc;
      }, {});
      if ('avgOrder' in totalsExp) {
        const ts = (groupedRows || []).reduce((s, r) => s + (Number(r.totalSales) || 0), 0);
        const to = (groupedRows || []).reduce((s, r) => s + (Number(r.orderCount) || 0), 0);
        totalsExp.avgOrder = to > 0 ? ts / to : 0;
      }
      // Pick orientation. Same logic as renderPivot — flipped puts measures as
      // rows and groups as columns.
      let pivotTable;
      if (!flipAxis) {
        const headHtml = `<tr>
          <th style="${thStyle}">${escapeHtml(groupLabel)}</th>
          ${measuresExp.map((m) => `<th style="${thStyle}; text-align:right;">${escapeHtml(m.label)}</th>`).join('')}
        </tr>`;
        const totalsHtml = `<tr style="background:#fef3c7;">
          <td><b>Total</b></td>
          ${measuresExp.map((m) => `<td style="text-align:right;"><b>${escapeHtml(fmtM(totalsExp[m.key], m.type))}</b></td>`).join('')}
        </tr>`;
        const rowsHtmlExp = (groupedRows || []).map((r) => `
          <tr>
            <td>${escapeHtml(r.label || '')}</td>
            ${measuresExp.map((m) => `<td style="text-align:right;">${escapeHtml(fmtM(r[m.key], m.type))}</td>`).join('')}
          </tr>
        `).join('') || `<tr><td colspan="${measuresExp.length + 1}" style="text-align:center;color:#6b7280;padding:14px;">No rows</td></tr>`;
        pivotTable = `<table style="${tableStyle}"><thead>${headHtml}${totalsHtml}</thead><tbody>${rowsHtmlExp}</tbody>`;
      } else {
        const headHtml = `<tr>
          <th style="${thStyle}">Measure</th>
          ${(groupedRows || []).map((r) => `<th style="${thStyle}; text-align:right;">${escapeHtml(r.label || '')}</th>`).join('')}
          <th style="${thStyle}; text-align:right;">Total</th>
        </tr>`;
        const rowsHtmlExp = measuresExp.map((m) => `
          <tr>
            <td><b>${escapeHtml(m.label)}</b></td>
            ${(groupedRows || []).map((r) => `<td style="text-align:right;">${escapeHtml(fmtM(r[m.key], m.type))}</td>`).join('')}
            <td style="text-align:right;background:#fef3c7;"><b>${escapeHtml(fmtM(totalsExp[m.key], m.type))}</b></td>
          </tr>
        `).join('');
        pivotTable = `<table style="${tableStyle}"><thead>${headHtml}</thead><tbody>${rowsHtmlExp}</tbody>`;
      }
      bodyHtml = `
        <h2>${viewMode === 'graph' ? 'Graph data' : 'Pivot'} — by ${escapeHtml(groupLabel)}${flipAxis ? ' (Axis: Flipped)' : ''}</h2>
        ${pivotTable}</table>
      `;
    } else {
      bodyHtml = `
          <h2>Top Products</h2>
          <table style="${tableStyle}"><thead><tr>
            <th style="${thStyle}">#</th><th style="${thStyle}">Product</th>
            <th style="${thStyle}; text-align:right;">Qty</th><th style="${thStyle}; text-align:right;">Revenue</th>
          </tr></thead><tbody>${productsRows}</tbody></table>
          <h2>Top Customers</h2>
          <table style="${tableStyle}"><thead><tr>
            <th style="${thStyle}">#</th><th style="${thStyle}">Customer</th>
            <th style="${thStyle}; text-align:right;">Orders</th><th style="${thStyle}; text-align:right;">Total</th>
          </tr></thead><tbody>${customersRows}</tbody></table>
          <h2>Payments Breakdown</h2>
          <table style="${tableStyle}"><thead><tr>
            <th style="${thStyle}">Method</th><th style="${thStyle}; text-align:right;">Txns</th>
            <th style="${thStyle}; text-align:right;">Total</th><th style="${thStyle}; text-align:right;">%</th>
          </tr></thead><tbody>${paymentRows}</tbody></table>
          ${pnlSection}
      `;
    }

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system,"Helvetica Neue",Arial,sans-serif; color:#1a1a2e; padding:24px; }
            td { ${tdStyle} }
            tr:nth-child(even) td { background:#fafbfc; }
            h2 { font-size:14px; color:#2E294E; margin: 18px 0 8px; }
          </style>
        </head>
        <body>
          ${head}
          ${bodyHtml}
        </body>
      </html>
    `;
  };

  const buildCsv = () => {
    const summary = salesData?.summary || {};
    const lines = [];
    const rangeLabel = dateRangeLabel;
    const tabLabel = (TABS.find((t) => t.key === selectedTab) || TABS[0]).label;
    lines.push(['Sales Report', rangeLabel].map(csvEscape).join(','));
    lines.push(['Mode', pageMode === 'analysis' ? 'Filters & Group By' : 'Overview'].map(csvEscape).join(','));
    lines.push(['View', exportViewLabel()].map(csvEscape).join(','));
    lines.push(['Tab', tabLabel].map(csvEscape).join(','));
    lines.push(['Filters', exportFilterLabel()].map(csvEscape).join(','));
    lines.push(['Group By', exportGroupLabel()].map(csvEscape).join(','));
    if (pageMode === 'analysis' && viewMode === 'pivot') {
      const measureLabels = MEASURES.filter((m) => selectedMeasures.includes(m.key)).map((m) => m.label).join(', ');
      lines.push(['Measures', measureLabels || 'Total Price'].map(csvEscape).join(','));
      lines.push(['Axis', flipAxis ? 'Flipped' : 'Standard'].map(csvEscape).join(','));
    }
    lines.push('');
    lines.push(['Metric', 'Value'].map(csvEscape).join(','));
    lines.push(['Total Sales', summary.totalSales || 0].map(csvEscape).join(','));
    lines.push(['Orders', summary.totalOrders || 0].map(csvEscape).join(','));
    lines.push(['Avg Order', summary.averageOrder || 0].map(csvEscape).join(','));
    lines.push('');

    if (pageMode === 'analysis') {
      const groupLabel = groupLabelFor(effectiveGroupBy) || 'Group';
      const hasQtyCsv = (groupedRows || []).some((r) => typeof r.qty === 'number');
      const measuresCsv = MEASURES.filter((m) =>
        selectedMeasures.includes(m.key) && (!m.requiresQty || hasQtyCsv)
      );
      lines.push([`# ${viewMode === 'graph' ? 'Graph data' : 'Pivot'} — by ${groupLabel}${flipAxis ? ' (Axis: Flipped)' : ''}`].map(csvEscape).join(','));
      if (!flipAxis) {
        lines.push([groupLabel, ...measuresCsv.map((m) => m.label)].map(csvEscape).join(','));
        (groupedRows || []).forEach((r) => {
          lines.push([r.label || '', ...measuresCsv.map((m) => r[m.key] || 0)].map(csvEscape).join(','));
        });
      } else {
        lines.push(['Measure', ...(groupedRows || []).map((r) => r.label || ''), 'Total'].map(csvEscape).join(','));
        const totalsCsv = measuresCsv.reduce((acc, m) => {
          acc[m.key] = (groupedRows || []).reduce((s, r) => s + (Number(r[m.key]) || 0), 0);
          return acc;
        }, {});
        if ('avgOrder' in totalsCsv) {
          const ts = (groupedRows || []).reduce((s, r) => s + (Number(r.totalSales) || 0), 0);
          const to = (groupedRows || []).reduce((s, r) => s + (Number(r.orderCount) || 0), 0);
          totalsCsv.avgOrder = to > 0 ? ts / to : 0;
        }
        measuresCsv.forEach((m) => {
          lines.push([m.label, ...(groupedRows || []).map((r) => r[m.key] || 0), totalsCsv[m.key]].map(csvEscape).join(','));
        });
      }
      return lines.join('\r\n');
    }

    lines.push(['# Top Products'].map(csvEscape).join(','));
    lines.push(['Rank', 'Product', 'Qty', 'Revenue'].map(csvEscape).join(','));
    (topProducts || []).forEach((p, i) => {
      lines.push([i + 1, p.name || '', p.quantity || 0, p.revenue || 0].map(csvEscape).join(','));
    });
    lines.push('');
    lines.push(['# Top Customers'].map(csvEscape).join(','));
    lines.push(['Rank', 'Customer', 'Orders', 'Total'].map(csvEscape).join(','));
    (topCustomers || []).forEach((c, i) => {
      lines.push([i + 1, c.name || '', c.count || 0, c.total || 0].map(csvEscape).join(','));
    });
    lines.push('');
    lines.push(['# Payments'].map(csvEscape).join(','));
    lines.push(['Method', 'Transactions', 'Total'].map(csvEscape).join(','));
    (paymentMethods || []).forEach((m) => {
      lines.push([m.name || '', m.count || 0, m.total || 0].map(csvEscape).join(','));
    });
    lines.push('');
    lines.push(['# Profit & Loss'].map(csvEscape).join(','));
    const _rev = Number(pnl?.revenue) || 0;
    const _cogs = Number(pnl?.cogs) || 0;
    const _gp = Number(pnl?.gross_profit) || (_rev - _cogs);
    const _opex = Number(opex) || 0;
    const _net = _gp - _opex;
    lines.push(['Revenue', _rev].map(csvEscape).join(','));
    lines.push(['COGS', _cogs].map(csvEscape).join(','));
    lines.push(['Gross Profit', _gp].map(csvEscape).join(','));
    lines.push(['Operating Expenses', _opex].map(csvEscape).join(','));
    lines.push(['Net Profit', _net].map(csvEscape).join(','));
    return lines.join('\r\n');
  };

  const saveFile = async ({ srcUri, content, fileName, mimeType, isBase64 = false }) => {
    if (Platform.OS === 'android') {
      try {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perm?.granted) {
          const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
            perm.directoryUri, fileName, mimeType
          );
          let payload = content;
          let encoding = FileSystem.EncodingType.UTF8;
          if (isBase64) {
            payload = await FileSystem.readAsStringAsync(srcUri, { encoding: FileSystem.EncodingType.Base64 });
            encoding = FileSystem.EncodingType.Base64;
          }
          await FileSystem.writeAsStringAsync(newUri, payload, { encoding });
          Toast.show({ type: 'success', text1: 'Saved', text2: fileName, position: 'bottom' });
          return true;
        }
      } catch (e) {
        console.warn('SAF save failed, falling back to share:', e?.message || e);
      }
    }
    let uriToShare = srcUri;
    if (!uriToShare) {
      uriToShare = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uriToShare, content, { encoding: FileSystem.EncodingType.UTF8 });
    }
    const can = await Sharing.isAvailableAsync();
    if (!can) {
      Toast.show({ type: 'error', text1: 'Sharing not available on this device', position: 'bottom' });
      return false;
    }
    await Sharing.shareAsync(uriToShare, {
      mimeType,
      dialogTitle: `Save ${fileName}`,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
    });
    return true;
  };

  const handleExportPdf = async () => {
    if (pdfBusy || xlsBusy) return;
    setPdfBusy(true);
    try {
      const html = buildHtml();
      const { uri } = await Print.printToFileAsync({ html });
      const fileTag = `${(activeDateKey || 'all').replace('date:', '').replace(':', '-')}-${pageMode === 'analysis' ? 'analysis' : 'overview'}`;
      const fileName = `sales-${fileTag}-${tsForFile()}.pdf`;
      await saveFile({ srcUri: uri, fileName, mimeType: 'application/pdf', isBase64: true });
    } catch (e) {
      console.warn('Sales PDF export failed:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Could not export PDF', text2: e?.message || '', position: 'bottom' });
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportExcel = async () => {
    if (pdfBusy || xlsBusy) return;
    setXlsBusy(true);
    try {
      const csv = buildCsv();
      const fileTag = `${(activeDateKey || 'all').replace('date:', '').replace(':', '-')}-${pageMode === 'analysis' ? 'analysis' : 'overview'}`;
      const fileName = `sales-${fileTag}-${tsForFile()}.csv`;
      await saveFile({ content: csv, fileName, mimeType: 'text/csv', isBase64: false });
    } catch (e) {
      console.warn('Sales Excel export failed:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Could not export Excel', text2: e?.message || '', position: 'bottom' });
    } finally {
      setXlsBusy(false);
    }
  };

  // ───── Filter / Group By bar (Odoo-style) ─────
  // Toggle helpers enforce two mutex rules:
  //   1. Invoiced ↔ Not Invoiced (semantic opposites)
  //   2. Only one `date:*` filter key can be active (Today vs Last 7 Days etc.)
  //   3. Only one `order_date:*` group-by key (date granularities are exclusive)
  const toggleFilter = (key) => {
    setSelectedFilters((prev) => {
      const isDate = String(key).startsWith('date:');
      if (isDate) {
        const cleaned = prev.filter((k) => !String(k).startsWith('date:'));
        // Tapping the already-active date key clears it (toggle off).
        if (prev.includes(key)) return cleaned;
        return cleaned.concat(key);
      }
      if (key === 'invoiced' && prev.includes('not_invoiced')) {
        return prev.filter((k) => k !== 'not_invoiced').concat('invoiced');
      }
      if (key === 'not_invoiced' && prev.includes('invoiced')) {
        return prev.filter((k) => k !== 'invoiced').concat('not_invoiced');
      }
      return prev.includes(key) ? prev.filter((k) => k !== key) : prev.concat(key);
    });
  };
  const toggleGroupBy = (key) => {
    setSelectedGroupBys((prev) => {
      const isDate = String(key).startsWith('order_date:');
      if (isDate) {
        const cleaned = prev.filter((k) => !String(k).startsWith('order_date:'));
        if (prev.includes(key)) return cleaned;
        return cleaned.concat(key);
      }
      return prev.includes(key) ? prev.filter((k) => k !== key) : prev.concat(key);
    });
  };

  // For mid-menu Custom Range / Custom Filter… actions — close the menu, set
  // the date:custom key, and pop the calendar to pick a start date.
  const openCustomDateFlow = () => {
    setSelectedFilters((prev) => {
      const cleaned = prev.filter((k) => !String(k).startsWith('date:'));
      return cleaned.concat('date:custom');
    });
    setMenuOpen(null);
    setCalendarOpen('from');
  };

  // Drill-down: tap an Order count cell in the pivot to see the underlying
  // pos.order rows for that product within the active date range.
  const openDrillDown = async ({ id, name }) => {
    if (!id) return;
    setDrillProduct({ id, name });
    setDrillOrders(null);
    try {
      const range = getDateRange(activeDateKey);
      const list = await fetchOrderLinesForProduct({ ...range, productId: id });
      setDrillOrders(list || []);
    } catch (e) {
      console.warn('Drill-down fetch failed:', e?.message || e);
      setDrillOrders([]);
    }
  };

  const openMenu = (kind) => {
    setMenuExpandedKey(null);
    setMenuOpen(kind);
  };

  // ───── Top-level mode switcher (Overview / Filters & Group By) ─────
  // The Overview tab is always visible. The Analysis tab is feature-gated so
  // admins can hide the deeper analytics surface for restricted roles; when
  // hidden the user simply stays on the Overview dashboard.
  const renderModeSwitcher = () => {
    const overviewItem = { key: 'overview', label: 'Overview',          icon: 'dashboard'    };
    const analysisItem = { key: 'analysis', label: 'Filters & Group By', icon: 'filter-list' };
    const renderTab = (m) => {
      const active = pageMode === m.key;
      return (
        <TouchableOpacity
          key={m.key}
          activeOpacity={0.85}
          onPress={() => setPageModeSafe(m.key)}
          style={[styles.modeBtn, active && styles.modeBtnActive]}
        >
          <MaterialIcons name={m.icon} size={14} color={active ? '#fff' : NAVY} />
          <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>
            {m.label}
          </Text>
        </TouchableOpacity>
      );
    };
    return (
      <View style={styles.modeSwitcher}>
        {renderTab(overviewItem)}
        <FeatureGate featureKey="sales_report.analysis_mode">
          {renderTab(analysisItem)}
        </FeatureGate>
      </View>
    );
  };

  // Overview mode shows the Section pill and a Date pill — same date presets
  // as the old period chips (Today / Last 7 Days / Last 30 Days / This Month /
  // This Year / All Time / Custom Range), exposed as a dropdown for parity
  // with the Section pill styling.
  const renderSectionPill = () => {
    const sectionActive = selectedTab !== 'overview';
    const dateActive = !!activeDateKey;
    return (
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterBarPill, sectionActive && styles.filterBarPillActive]}
          activeOpacity={0.85}
          onPress={() => openMenu('section')}
        >
          <MaterialIcons name="dashboard" size={14} color={sectionActive ? '#fff' : NAVY} />
          <Text
            numberOfLines={1}
            style={[styles.filterBarPillText, sectionActive && styles.filterBarPillTextActive]}
          >
            {sectionLabel}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={16} color={sectionActive ? '#fff' : NAVY} />
        </TouchableOpacity>
        <FeatureGate featureKey="sales_report.date_filter">
          <TouchableOpacity
            style={[styles.filterBarPill, dateActive && styles.filterBarPillActive]}
            activeOpacity={0.85}
            onPress={() => openMenu('date')}
          >
            <MaterialIcons name="event" size={14} color={dateActive ? '#fff' : NAVY} />
            <Text
              numberOfLines={1}
              style={[styles.filterBarPillText, dateActive && styles.filterBarPillTextActive]}
            >
              {dateRangeLabel}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={16} color={dateActive ? '#fff' : NAVY} />
          </TouchableOpacity>
        </FeatureGate>
      </View>
    );
  };

  // Analysis mode shows only Filters + Group By pills — no Section pill, since
  // Analysis is cross-section.
  const renderAnalysisFilterBar = () => (
    <View style={styles.filterBar}>
      <FeatureGate featureKey="sales_report.filter">
        <TouchableOpacity
          style={[styles.filterBarPill, selectedFilters.length > 0 && styles.filterBarPillActive]}
          activeOpacity={0.85}
          onPress={() => openMenu('filter')}
        >
          <MaterialIcons name="filter-list" size={14} color={selectedFilters.length > 0 ? '#fff' : NAVY} />
          <Text style={[styles.filterBarPillText, selectedFilters.length > 0 && styles.filterBarPillTextActive]}>
            Filters{selectedFilters.length > 0 ? ` · ${selectedFilters.length}` : ''}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={16} color={selectedFilters.length > 0 ? '#fff' : NAVY} />
        </TouchableOpacity>
      </FeatureGate>
      <FeatureGate featureKey="sales_report.group_by">
        <TouchableOpacity
          style={[styles.filterBarPill, selectedGroupBys.length > 0 && styles.filterBarPillActive]}
          activeOpacity={0.85}
          onPress={() => openMenu('group')}
        >
          <MaterialCommunityIcons name="format-list-group" size={14} color={selectedGroupBys.length > 0 ? '#fff' : NAVY} />
          <Text style={[styles.filterBarPillText, selectedGroupBys.length > 0 && styles.filterBarPillTextActive]}>
            Group By{selectedGroupBys.length > 0 ? ` · ${selectedGroupBys.length}` : ''}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={16} color={selectedGroupBys.length > 0 ? '#fff' : NAVY} />
        </TouchableOpacity>
      </FeatureGate>
    </View>
  );

  const filterLabelFor = (key) => {
    if (typeof key === 'string' && key.startsWith('date:')) {
      const presetLabel = key === 'date:custom'
        ? `${customStart} → ${customEnd}`
        : (DATE_FILTER_LABELS[key] || 'Custom');
      return `Order Date: ${presetLabel}`;
    }
    const flat = FILTER_OPTIONS.find((o) => o.key === key);
    return flat?.label || key;
  };

  const renderActiveChips = () => {
    if (selectedFilters.length === 0 && selectedGroupBys.length === 0) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.activeChipsRow}
      >
        {selectedFilters.map((k) => (
          <TouchableOpacity
            key={`f-${k}`}
            activeOpacity={0.85}
            style={styles.activeChip}
            onPress={() => toggleFilter(k)}
          >
            <Text style={styles.activeChipText}>{filterLabelFor(k)}</Text>
            <MaterialIcons name="close" size={12} color="#fff" />
          </TouchableOpacity>
        ))}
        {selectedGroupBys.map((k) => (
          <TouchableOpacity
            key={`g-${k}`}
            activeOpacity={0.85}
            style={[styles.activeChip, styles.activeChipGroup]}
            onPress={() => toggleGroupBy(k)}
          >
            <Text style={styles.activeChipText}>Group: {groupLabelFor(k)}</Text>
            <MaterialIcons name="close" size={12} color="#fff" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderViewModeToggle = () => {
    // Overview mode: dashboard is implicit; no toggle.
    // Analysis mode: only Graph + Pivot — List doesn't apply.
    if (pageMode !== 'analysis') return null;
    const modes = VIEW_MODES.filter((m) => m.key !== 'list');
    return (
      <View style={styles.viewModeRow}>
        {modes.map((m) => {
          const active = viewMode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              activeOpacity={0.85}
              onPress={() => setViewMode(m.key)}
              style={[styles.viewModeBtn, active && styles.viewModeBtnActive]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <MaterialIcons name={m.icon} size={16} color={active ? '#fff' : NAVY} />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ───── Pivot table renderer (Group By rows × measure columns) ─────
  const renderPivot = (rows) => {
    if (!effectiveGroupBy) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="grid-on" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>Pick a Group By option to build a pivot table</Text>
        </View>
      );
    }
    if (!rows || rows.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="grid-on" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>No rows to pivot for this selection</Text>
        </View>
      );
    }
    const hasQty = rows.some((r) => typeof r.qty === 'number');
    // Active measure columns honour the user's Measures dropdown selection,
    // hiding qty-based measures when the active grouping doesn't carry qty.
    const activeMeasures = MEASURES.filter((m) =>
      selectedMeasures.includes(m.key) && (!m.requiresQty || hasQty)
    );
    const formatMeasure = (val, type) => type === 'money' ? fmtMoney(val || 0) : formatNumber(val || 0);

    // Per-measure totals across all groups. Average Price can't be summed
    // arithmetically — recompute it from the totals of totalSales / orderCount
    // so the totals row stays honest.
    const totals = activeMeasures.reduce((acc, m) => {
      acc[m.key] = rows.reduce((s, r) => s + (Number(r[m.key]) || 0), 0);
      return acc;
    }, {});
    if ('avgOrder' in totals) {
      const totalSalesSum = rows.reduce((s, r) => s + (Number(r.totalSales) || 0), 0);
      const totalOrdersSum = rows.reduce((s, r) => s + (Number(r.orderCount) || 0), 0);
      totals.avgOrder = totalOrdersSum > 0 ? totalSalesSum / totalOrdersSum : 0;
    }

    const groupHeaderLabel = groupLabelFor(effectiveGroupBy) || 'Group';
    // Drill-down is wired only for product-style groupings — those are the
    // only ones where "show me the underlying orders" is unambiguous today.
    const isProductGrouping = effectiveGroupBy === 'product'
      || effectiveGroupBy === 'product_category'
      || effectiveGroupBy === 'pos_categ';

    if (!flipAxis) {
      // Standard orientation: groups as rows, measures as columns.
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pivotTable}>
            <View style={[styles.pivotRow, styles.pivotHeadRow]}>
              <Text style={[styles.pivotCell, styles.pivotCellLabel, styles.pivotHeadText]}>
                {groupHeaderLabel}
              </Text>
              {activeMeasures.map((m) => (
                <Text key={m.key} style={[styles.pivotCell, styles.pivotHeadText]}>{m.label}</Text>
              ))}
            </View>
            <View style={[styles.pivotRow, styles.pivotTotalRow]}>
              <Text style={[styles.pivotCell, styles.pivotCellLabel, styles.pivotTotalText]}>Total</Text>
              {activeMeasures.map((m) => (
                <Text
                  key={m.key}
                  style={[styles.pivotCell, m.type === 'money' && styles.pivotCellMoney, styles.pivotTotalText]}
                >
                  {formatMeasure(totals[m.key], m.type)}
                </Text>
              ))}
            </View>
            {rows.map((r) => (
              <View key={String(r.key)} style={styles.pivotRow}>
                <Text style={[styles.pivotCell, styles.pivotCellLabel]} numberOfLines={1}>{r.label}</Text>
                {activeMeasures.map((m) => {
                  // Make Order count cells tappable for product groupings —
                  // tapping drills into the underlying orders for that product.
                  // FeatureGate fallback renders a plain (non-tappable) cell so
                  // restricted users still see the number, just can't drill.
                  const drillable = m.key === 'orderCount' && isProductGrouping;
                  const plainCell = (
                    <Text
                      key={m.key}
                      style={[styles.pivotCell, m.type === 'money' && styles.pivotCellMoney]}
                    >
                      {formatMeasure(r[m.key], m.type)}
                    </Text>
                  );
                  if (drillable) {
                    return (
                      <FeatureGate key={m.key} featureKey="sales_report.drill_down" fallback={plainCell}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => openDrillDown({ id: r.key, name: r.label })}
                        >
                          <Text style={[styles.pivotCell, styles.pivotCellLink]}>
                            {formatMeasure(r[m.key], m.type)}
                          </Text>
                        </TouchableOpacity>
                      </FeatureGate>
                    );
                  }
                  return plainCell;
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }

    // Flipped orientation: measures as rows, groups as columns + a Total column
    // on the right. Super-header band spans the group columns (mirrors Odoo).
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.pivotTable}>
          <View style={[styles.pivotRow, styles.pivotHeadRow]}>
            <Text style={[styles.pivotCell, styles.pivotCellLabel, styles.pivotHeadText]}>Measure</Text>
            {rows.map((r) => {
              const plainHeader = (
                <Text
                  key={String(r.key)}
                  style={[styles.pivotCell, styles.pivotHeadText]}
                  numberOfLines={1}
                >
                  {r.label}
                </Text>
              );
              return isProductGrouping ? (
                <FeatureGate key={String(r.key)} featureKey="sales_report.drill_down" fallback={plainHeader}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => openDrillDown({ id: r.key, name: r.label })}
                  >
                    <Text
                      style={[styles.pivotCell, styles.pivotHeadText, styles.pivotHeadTextLink]}
                      numberOfLines={1}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                </FeatureGate>
              ) : (
                <Text key={String(r.key)} style={[styles.pivotCell, styles.pivotHeadText]} numberOfLines={1}>
                  {r.label}
                </Text>
              );
            })}
            <Text style={[styles.pivotCell, styles.pivotHeadText]}>Total</Text>
          </View>
          {activeMeasures.map((m) => (
            <View key={m.key} style={styles.pivotRow}>
              <Text style={[styles.pivotCell, styles.pivotCellLabel]}>{m.label}</Text>
              {rows.map((r) => (
                <Text
                  key={String(r.key)}
                  style={[styles.pivotCell, m.type === 'money' && styles.pivotCellMoney]}
                >
                  {formatMeasure(r[m.key], m.type)}
                </Text>
              ))}
              <Text
                style={[styles.pivotCell, m.type === 'money' && styles.pivotCellMoney, styles.pivotTotalText]}
              >
                {formatMeasure(totals[m.key], m.type)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // ───── Graph (bar chart) renderer ─────
  const renderGraph = (rows) => {
    if (!effectiveGroupBy) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="bar-chart" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>Pick a Group By option to chart the data</Text>
        </View>
      );
    }
    if (!rows || rows.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="bar-chart" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>No data to chart for this selection</Text>
        </View>
      );
    }
    const top = rows.slice(0, 8); // chart-kit hates dense bars; cap at 8.
    const chartData = {
      labels: top.map((r) => truncLabel(r.label, 8)),
      datasets: [{ data: top.map((r) => Number(r.totalSales) || 0) }],
    };
    const chartWidth = Math.max(Dimensions.get('window').width - 36, 320);
    return (
      <View style={styles.graphCard}>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={240}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(46, 41, 78, ${opacity})`,
            labelColor: () => '#1a1a2e',
            barPercentage: 0.6,
            propsForLabels: { fontSize: 10 },
          }}
          showValuesOnTopOfBars
          fromZero
          style={{ borderRadius: 12 }}
        />
        {rows.length > 8 ? (
          <Text style={styles.graphFootnote}>Showing top 8 of {rows.length} groups</Text>
        ) : null}
      </View>
    );
  };

  // ───── Hero KPI strip ─────
  const renderHero = () => {
    const summary = salesData?.summary || {};
    const total = summary.totalSales || 0;
    const orders = summary.totalOrders || 0;
    const avg = summary.averageOrder || 0;

    return (
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>TOTAL SALES</Text>
            <Text style={styles.heroAmount}>{fmtMoney(total)}</Text>
            <View style={styles.heroSubRow}>
              <Text style={styles.heroSub}>{dateRangeLabel}</Text>
              {totalDelta ? (
                <View
                  style={[
                    styles.deltaBadge,
                    totalDelta.dir === 'up' && { backgroundColor: 'rgba(34,197,94,0.18)' },
                    totalDelta.dir === 'down' && { backgroundColor: 'rgba(248,113,113,0.18)' },
                    totalDelta.dir === 'flat' && { backgroundColor: 'rgba(255,255,255,0.18)' },
                  ]}
                >
                  <MaterialIcons
                    name={
                      totalDelta.dir === 'up'
                        ? 'arrow-upward'
                        : totalDelta.dir === 'down'
                          ? 'arrow-downward'
                          : 'remove'
                    }
                    size={11}
                    color={
                      totalDelta.dir === 'up'
                        ? '#86efac'
                        : totalDelta.dir === 'down'
                          ? '#fca5a5'
                          : '#fff'
                    }
                  />
                  <Text
                    style={[
                      styles.deltaBadgeText,
                      totalDelta.dir === 'up' && { color: '#86efac' },
                      totalDelta.dir === 'down' && { color: '#fca5a5' },
                    ]}
                  >
                    {totalDelta.pct.toFixed(1)}% vs prev
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.heroDisk}>
            <MaterialCommunityIcons name="finance" size={24} color={ORANGE} />
          </View>
        </View>

        <View style={styles.heroStatsRow}>
          <TouchableOpacity
            style={styles.heroStat}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('OrdersAnalysis', { period: activeDateKey || 'all', ordersData: salesData })}
          >
            <View style={styles.heroStatIconWrap}>
              <MaterialIcons name="receipt-long" size={16} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroStatValue}>{formatNumber(orders)}</Text>
              <Text style={styles.heroStatLabel}>Orders</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color="#cbd5e1" />
          </TouchableOpacity>

          <View style={styles.heroStat}>
            <View style={styles.heroStatIconWrap}>
              <MaterialIcons name="trending-up" size={16} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroStatValue}>{fmtMoney(avg)}</Text>
              <Text style={styles.heroStatLabel}>Avg Order</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // ───── View-mode toggle + PDF / Excel export buttons ─────
  // The horizontal tab strip moved into the Section dropdown pill, so this
  // row now stands alone directly below the filter bar / chips.
  const renderExportBar = () => (
    <View style={styles.exportRow}>
      {renderViewModeToggle()}
      {pageMode === 'analysis' && viewMode === 'pivot' ? (
        <FeatureGate featureKey="sales_report.pivot_controls">
          <TouchableOpacity
            style={[styles.exportBarPill, selectedMeasures.length > 1 && styles.exportBarPillActive]}
            activeOpacity={0.85}
            onPress={() => openMenu('measures')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name="straighten" size={14} color={selectedMeasures.length > 1 ? '#fff' : NAVY} />
            <Text style={[styles.exportBarPillText, selectedMeasures.length > 1 && styles.exportBarPillTextActive]}>
              Measures{selectedMeasures.length > 1 ? ` · ${selectedMeasures.length}` : ''}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={16} color={selectedMeasures.length > 1 ? '#fff' : NAVY} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.flipBtn, flipAxis && styles.flipBtnActive]}
            activeOpacity={0.85}
            onPress={() => setFlipAxis((v) => !v)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name="swap-horiz" size={16} color={flipAxis ? '#fff' : NAVY} />
          </TouchableOpacity>
        </FeatureGate>
      ) : null}
      <View style={{ flex: 1 }} />
      <FeatureGate featureKey="sales_report.export_pdf">
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnPdf, (pdfBusy || xlsBusy) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={pdfBusy || xlsBusy}
          onPress={handleExportPdf}
        >
          {pdfBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="picture-as-pdf" size={14} color="#fff" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </FeatureGate>
      <FeatureGate featureKey="sales_report.export_excel">
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnXls, (pdfBusy || xlsBusy) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={pdfBusy || xlsBusy}
          onPress={handleExportExcel}
        >
          {xlsBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="grid-on" size={14} color="#fff" />
              <Text style={styles.exportBtnText}>Excel</Text>
            </>
          )}
        </TouchableOpacity>
      </FeatureGate>
    </View>
  );

  // ───── Top products ─────
  const renderTopProducts = (max) => {
    if (!topProducts || topProducts.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="shopping-cart" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>No product sales for this period</Text>
        </View>
      );
    }
    const list = max ? topProducts.slice(0, max) : topProducts;
    const top = list[0];
    const topRevenue = top ? Number(top.revenue) || 0 : 0;
    return (
      <View style={styles.cardList}>
        {list.map((p, i) => {
          const revenue = Number(p.revenue) || 0;
          const pct = topRevenue > 0 ? Math.round((revenue / topRevenue) * 100) : 0;
          return (
            <View key={p.id || i} style={styles.productRow}>
              <View style={styles.rankDisk}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.productMeta}>{formatNumber(p.quantity)} sold</Text>
                <View style={styles.productBarTrack}>
                  <View style={[styles.productBarFill, { width: `${pct}%` }]} />
                </View>
              </View>
              <Text style={styles.productRevenue}>{fmtMoney(revenue)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ───── Profit & Loss ─────
  const renderPnL = () => {
    const revenue = Number(pnl?.revenue) || 0;
    const cogs = Number(pnl?.cogs) || 0;
    const gross = Number(pnl?.gross_profit) || (revenue - cogs);
    const grossPct = revenue > 0 ? (gross / revenue) * 100 : 0;
    const operating = Number(opex) || 0;
    const net = gross - operating;
    const netPct = revenue > 0 ? (net / revenue) * 100 : 0;

    if (revenue === 0) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="trending-up" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>No paid sales for this period — P&L unavailable</Text>
        </View>
      );
    }
    const pillFor = (n) => (n >= 0
      ? { bg: 'rgba(34,197,94,0.18)', fg: '#86efac' }
      : { bg: 'rgba(248,113,113,0.18)', fg: '#fca5a5' });
    const grossPill = pillFor(gross);
    const netPill = pillFor(net);

    return (
      <View>
        <View style={styles.pnlCard}>
          <View style={styles.pnlRow}>
            <Text style={styles.pnlLabel}>Revenue</Text>
            <Text style={styles.pnlValue}>{fmtMoney(revenue)}</Text>
          </View>
          <View style={styles.pnlRow}>
            <Text style={[styles.pnlLabel, { color: 'rgba(255,255,255,0.7)' }]}>− Cost of Goods Sold</Text>
            <Text style={[styles.pnlValue, { color: 'rgba(255,255,255,0.85)' }]}>{fmtMoney(cogs)}</Text>
          </View>
          <View style={styles.pnlDivider} />
          <View style={styles.pnlRow}>
            <Text style={[styles.pnlLabel, styles.pnlLabelStrong]}>Gross Profit</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.pnlValue, styles.pnlValueStrong]}>{fmtMoney(gross)}</Text>
              <View style={[styles.marginPill, { backgroundColor: grossPill.bg }]}>
                <Text style={[styles.marginPillText, { color: grossPill.fg }]}>{grossPct.toFixed(1)}%</Text>
              </View>
            </View>
          </View>
          <View style={styles.pnlRow}>
            <Text style={[styles.pnlLabel, { color: 'rgba(255,255,255,0.7)' }]}>− Operating Expenses</Text>
            <Text style={[styles.pnlValue, { color: 'rgba(255,255,255,0.85)' }]}>{fmtMoney(operating)}</Text>
          </View>
          <View style={styles.pnlDivider} />
          <View style={styles.pnlRow}>
            <Text style={[styles.pnlLabel, styles.pnlLabelStrong]}>Net Profit</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.pnlValue, styles.pnlValueStrong]}>{fmtMoney(net)}</Text>
              <View style={[styles.marginPill, { backgroundColor: netPill.bg }]}>
                <Text style={[styles.marginPillText, { color: netPill.fg }]}>{netPct.toFixed(1)}%</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.pnlNote}>
          <MaterialIcons name="info-outline" size={14} color={MUTED} />
          <Text style={styles.pnlNoteText}>
            Counts paid / done / invoiced orders only. Operating expenses pulled from Expenses logged in this period.
          </Text>
        </View>
      </View>
    );
  };

  // ───── Top customers ─────
  const renderTopCustomers = (max) => {
    if (!topCustomers || topCustomers.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="people-outline" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>No customer-attributed sales for this period</Text>
        </View>
      );
    }
    const list = max ? topCustomers.slice(0, max) : topCustomers;
    const top = list[0];
    const topTotal = top ? Number(top.total) || 0 : 0;
    return (
      <View style={styles.cardList}>
        {list.map((c, i) => {
          const total = Number(c.total) || 0;
          const pct = topTotal > 0 ? Math.round((total / topTotal) * 100) : 0;
          const initial = (c.name || '?').trim().charAt(0).toUpperCase() || '?';
          return (
            <View key={c.id || i} style={styles.productRow}>
              <View style={styles.customerAvatar}>
                <Text style={styles.customerInitial}>{initial}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.productName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.productMeta}>{formatNumber(c.count)} orders</Text>
                <View style={styles.productBarTrack}>
                  <View style={[styles.productBarFill, { width: `${pct}%`, backgroundColor: NAVY }]} />
                </View>
              </View>
              <Text style={styles.productRevenue}>{fmtMoney(total)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ───── Payment methods ─────
  const renderPayments = () => {
    if (!paymentMethods || paymentMethods.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons name="payment" size={36} color="#cbd5e1" />
          <Text style={styles.emptyText}>No payments for this period</Text>
        </View>
      );
    }
    const totalPayments = paymentMethods.reduce((s, m) => s + (Number(m.total) || 0), 0);
    return (
      <View style={styles.cardList}>
        {paymentMethods.map((m, i) => {
          const total = Number(m.total) || 0;
          const pct = totalPayments > 0 ? (total / totalPayments) * 100 : 0;
          const iconName = String(m.name || '').toLowerCase().includes('cash')
            ? 'payments'
            : String(m.name || '').toLowerCase().includes('bank')
              ? 'account-balance'
              : 'credit-card';
          return (
            <View key={m.id || i} style={styles.payCard}>
              <View style={styles.payHead}>
                <View style={styles.payIcon}>
                  <MaterialIcons name={iconName} size={20} color={NAVY} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.payName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.payMeta}>{formatNumber(m.count)} transactions</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.payAmount}>{fmtMoney(total)}</Text>
                  <Text style={styles.payPct}>{pct.toFixed(1)}%</Text>
                </View>
              </View>
              <View style={styles.payBarTrack}>
                <View style={[styles.payBarFill, { width: `${pct}%` }]} />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // ───── Body switch ─────
  // In List mode, every tab renders the same content it always has — keeps
  // the default user experience identical to pre-Odoo-filter behaviour.
  // Graph / Pivot modes share a single renderer per tab and read from
  // `groupedRows` (memoized above) so we don't refetch anything.
  const renderTabHeading = () => {
    if (selectedTab === 'products')  return 'All Top Products';
    if (selectedTab === 'customers') return 'All Top Customers';
    if (selectedTab === 'payments')  return 'Payments Breakdown';
    if (selectedTab === 'pnl')       return 'Profit & Loss';
    return 'Overview';
  };

  const renderNonListView = () => {
    const usingFallback = !activeGroupBy && !!effectiveGroupBy;
    // In Analysis mode the heading is just the grouping label (no "Overview"
    // prefix, since the section pill doesn't apply here).
    const heading = pageMode === 'analysis'
      ? (effectiveGroupBy ? `By ${groupLabelFor(effectiveGroupBy)}` : 'Analysis')
      : `${renderTabHeading()}${effectiveGroupBy ? ` — by ${groupLabelFor(effectiveGroupBy)}` : ''}`;
    return (
      <View>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{heading}</Text>
        </View>
        {usingFallback ? (
          <Text style={styles.fallbackHint}>
            Default grouping for this section — pick a Group By to change.
          </Text>
        ) : null}
        {viewMode === 'graph' ? renderGraph(groupedRows) : renderPivot(groupedRows)}
      </View>
    );
  };

  const renderBody = () => {
    // Analysis mode is always the pivot/graph workspace — no per-section
    // dashboard cards, no List view, no hero card (per spec: that big blue
    // Total Sales bar belongs to the Overview dashboard only).
    if (pageMode === 'analysis') {
      return renderNonListView();
    }
    if (selectedTab === 'overview') {
      return (
        <View>
          {renderHero()}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Top Products</Text>
            {topProducts.length > 5 ? (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedTab('products')}>
                <Text style={styles.sectionLink}>View all</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {renderTopProducts(5)}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Top Customers</Text>
            {topCustomers.length > 5 ? (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedTab('customers')}>
                <Text style={styles.sectionLink}>View all</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {renderTopCustomers(5)}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Payments Breakdown</Text>
          </View>
          {renderPayments()}
        </View>
      );
    }
    if (selectedTab === 'products') {
      return (
        <View>
          {renderHero()}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>All Top Products</Text>
          </View>
          {renderTopProducts()}
        </View>
      );
    }
    if (selectedTab === 'customers') {
      return (
        <View>
          {renderHero()}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>All Top Customers</Text>
          </View>
          {renderTopCustomers()}
        </View>
      );
    }
    if (selectedTab === 'pnl') {
      return (
        <View>
          {renderHero()}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Profit &amp; Loss</Text>
          </View>
          {renderPnL()}
        </View>
      );
    }
    return (
      <View>
        {renderHero()}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Payments Breakdown</Text>
        </View>
        {renderPayments()}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Sales Report" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        >
          {renderModeSwitcher()}
          {pageMode === 'overview' ? renderSectionPill() : renderAnalysisFilterBar()}
          {renderActiveChips()}
          {renderExportBar()}
          {loading && !refreshing && (!salesData || !salesData.summary) ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={NAVY} />
            </View>
          ) : (
            renderBody()
          )}
        </ScrollView>
      </RoundedContainer>
      <OverlayLoader visible={loading && !salesData} />

      {/* Calendar popup for the custom date range */}
      <Modal
        visible={!!calendarOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCalendarOpen(null)}
      >
        <TouchableWithoutFeedback onPress={() => setCalendarOpen(null)}>
          <View style={styles.calendarBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.calendarCard}>
                <View style={styles.calendarHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.calendarTitle}>
                      {calendarOpen === 'from' ? 'Pick start date' : 'Pick end date'}
                    </Text>
                    <Text style={styles.calendarSubtitle}>
                      {calendarOpen === 'from' ? 'Step 1 of 2' : 'Step 2 of 2'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setCalendarOpen(null)}
                    style={styles.calendarCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="close" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>
                {/* From / To label cells — the active step gets a highlighted
                    border so the user always knows which date they're picking. */}
                <View style={styles.fromToRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setCalendarOpen('from')}
                    style={[
                      styles.fromToCell,
                      calendarOpen === 'from' && styles.fromToCellActive,
                    ]}
                  >
                    <Text style={styles.fromToLabel}>FROM</Text>
                    <Text style={styles.fromToValue}>
                      {customStart || '—'}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.fromToArrow}>
                    <MaterialIcons name="arrow-forward" size={16} color={MUTED} />
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setCalendarOpen('to')}
                    style={[
                      styles.fromToCell,
                      calendarOpen === 'to' && styles.fromToCellActive,
                    ]}
                  >
                    <Text style={styles.fromToLabel}>TO</Text>
                    <Text style={styles.fromToValue}>
                      {customEnd && customEnd !== customStart ? customEnd : '—'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Calendar
                  current={calendarOpen === 'from' ? customStart : customEnd}
                  maxDate={isoDateOnly(new Date())}
                  onDayPress={({ dateString }) => {
                    if (calendarOpen === 'from') {
                      // First tap selects the start of the range. Clear the
                      // previous end so the user explicitly picks both, then
                      // advance to the end-date step instead of closing.
                      setCustomStart(dateString);
                      setCustomEnd(dateString);
                      setCalendarOpen('to');
                    } else {
                      // Second tap selects the end. Snap backward if the user
                      // picks a date earlier than the current start.
                      let to = dateString;
                      let from = customStart;
                      if (to < from) { from = to; }
                      setCustomEnd(to);
                      setCustomStart(from);
                      setCalendarOpen(null);
                    }
                  }}
                  markedDates={(() => {
                    const m = {};
                    if (customStart) {
                      m[customStart] = {
                        startingDay: true,
                        color: NAVY,
                        textColor: '#fff',
                      };
                    }
                    if (customEnd && customEnd !== customStart) {
                      m[customEnd] = {
                        endingDay: true,
                        color: NAVY,
                        textColor: '#fff',
                      };
                      // mark days in between
                      try {
                        const s = new Date(customStart);
                        const e = new Date(customEnd);
                        const cur = new Date(s);
                        cur.setDate(cur.getDate() + 1);
                        while (cur < e) {
                          m[isoDateOnly(cur)] = { color: '#eef0f5', textColor: NAVY };
                          cur.setDate(cur.getDate() + 1);
                        }
                      } catch (_) {}
                    }
                    return m;
                  })()}
                  markingType="period"
                  theme={{
                    backgroundColor: '#fff',
                    calendarBackground: '#fff',
                    selectedDayBackgroundColor: NAVY,
                    selectedDayTextColor: '#fff',
                    todayTextColor: ORANGE,
                    arrowColor: NAVY,
                    monthTextColor: NAVY,
                    textMonthFontWeight: '700',
                    textDayHeaderFontWeight: '700',
                    textDayFontWeight: '600',
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Drill-down popup — tap an Order cell to see the underlying orders */}
      <Modal
        visible={!!drillProduct}
        animationType="fade"
        transparent
        onRequestClose={() => setDrillProduct(null)}
      >
        <TouchableWithoutFeedback onPress={() => setDrillProduct(null)}>
          <View style={styles.menuBackdrop}>
            {/* Card claims responder via onStartShouldSetResponder instead of
                being wrapped in TouchableWithoutFeedback — TWF intercepts the
                ScrollView's scroll gestures and prevents the user from
                dragging the order list. Plain responder claim absorbs taps
                without breaking scroll. */}
            <View
              onStartShouldSetResponder={() => true}
              style={[
                styles.menuCard,
                { maxWidth: 480, maxHeight: Dimensions.get('window').height * 0.8, flexShrink: 1 },
              ]}
            >
              <View style={styles.menuHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuTitle}>Orders</Text>
                  <Text style={styles.calendarSubtitle} numberOfLines={1}>
                    {drillProduct?.name || ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDrillProduct(null)}
                  style={styles.calendarCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons name="close" size={20} color="#1a1a2e" />
                </TouchableOpacity>
              </View>
              {drillOrders === null ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={NAVY} />
                </View>
              ) : drillOrders.length === 0 ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <Text style={styles.emptyText}>No orders for this product in the active range.</Text>
                </View>
              ) : (
                <ScrollView
                  style={{ flexShrink: 1 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {drillOrders.map((row, idx) => {
                      const dateLabel = (() => {
                        if (!row.date_order) return '';
                        const iso = String(row.date_order).replace(' ', 'T');
                        const d = new Date(iso.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z');
                        if (isNaN(d.getTime())) return row.date_order;
                        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                      })();
                      return (
                        <View key={`${row.order_id}-${idx}`} style={styles.drillRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.drillOrderName} numberOfLines={1}>
                              {row.order_name || `Order ${row.order_id}`}
                            </Text>
                            <Text style={styles.drillMeta} numberOfLines={1}>
                              {dateLabel}
                              {row.state ? `  ·  ${row.state}` : ''}
                              {Array.isArray(row.partner_id) ? `  ·  ${row.partner_id[1]}` : ''}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.drillTotal}>{fmtMoney(row.line_total)}</Text>
                            <Text style={styles.drillQty}>Qty {formatNumber(row.qty || 0)}</Text>
                          </View>
                        </View>
                      );
                    })}
                </ScrollView>
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Filters / Group By menu — Odoo-style multi-select popup */}
      <Modal
        visible={!!menuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuOpen(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuOpen(null)}>
          <View style={styles.menuBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.menuCard}>
                <View style={styles.menuHead}>
                  <Text style={styles.menuTitle}>
                    {menuOpen === 'filter'   ? 'Filters'
                     : menuOpen === 'group'   ? 'Group By'
                     : menuOpen === 'date'    ? 'Date Range'
                     : menuOpen === 'measures'? 'Measures'
                     : 'Section'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setMenuOpen(null)}
                    style={styles.calendarCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="close" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 420 }}>
                  {menuOpen === 'section' ? (
                    TABS.map((t) => {
                      const active = selectedTab === t.key;
                      return (
                        <TouchableOpacity
                          key={t.key}
                          activeOpacity={0.75}
                          onPress={() => {
                            setSelectedTab(t.key);
                            setMenuOpen(null);
                          }}
                          style={styles.menuRow}
                        >
                          <MaterialIcons
                            name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                            size={18}
                            color={active ? NAVY : '#cbd5e1'}
                          />
                          <Text
                            style={[
                              styles.menuRowText,
                              active && { color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : menuOpen === 'date' ? (
                    [
                      { key: null,           label: 'All Time'      },
                      { key: 'date:today',   label: 'Today'         },
                      { key: 'date:7d',      label: 'Last 7 Days'   },
                      { key: 'date:30d',     label: 'Last 30 Days'  },
                      { key: 'date:month',   label: 'This Month'    },
                      { key: 'date:year',    label: 'This Year'     },
                      { key: 'date:custom',  label: 'Custom Range…' },
                    ].map((opt) => {
                      const active = (opt.key === null && !activeDateKey) || activeDateKey === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key || 'all'}
                          activeOpacity={0.75}
                          onPress={() => {
                            if (opt.key === 'date:custom') {
                              openCustomDateFlow();
                              return;
                            }
                            // Replace any existing date:* key with the new one (or
                            // clear all date keys for "All Time").
                            setSelectedFilters((prev) => {
                              const cleaned = prev.filter((k) => !String(k).startsWith('date:'));
                              return opt.key ? cleaned.concat(opt.key) : cleaned;
                            });
                            setMenuOpen(null);
                          }}
                          style={styles.menuRow}
                        >
                          <MaterialIcons
                            name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                            size={18}
                            color={active ? NAVY : '#cbd5e1'}
                          />
                          <Text
                            style={[
                              styles.menuRowText,
                              active && { color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : menuOpen === 'measures' ? (
                    MEASURES
                      .filter((m) => !m.requiresQty || (groupedRows || []).some((r) => typeof r.qty === 'number'))
                      .map((m) => {
                        const checked = selectedMeasures.includes(m.key);
                        return (
                          <TouchableOpacity
                            key={m.key}
                            activeOpacity={0.75}
                            onPress={() => {
                              setSelectedMeasures((prev) => (
                                prev.includes(m.key)
                                  ? prev.filter((k) => k !== m.key)
                                  : prev.concat(m.key)
                              ));
                            }}
                            style={styles.menuRow}
                          >
                            <MaterialIcons
                              name={checked ? 'check-box' : 'check-box-outline-blank'}
                              size={18}
                              color={checked ? NAVY : '#cbd5e1'}
                            />
                            <Text style={styles.menuRowText}>{m.label}</Text>
                          </TouchableOpacity>
                        );
                      })
                  ) : (menuOpen === 'filter' ? FILTER_OPTIONS : groupByOptionsForTab).map((opt) => {
                    if (opt.type === 'expandable') {
                      const expanded = menuExpandedKey === opt.key;
                      const arr = menuOpen === 'filter' ? selectedFilters : selectedGroupBys;
                      const activeChild = (opt.children || []).find((c) => arr.includes(c.key));
                      return (
                        <View key={opt.key}>
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setMenuExpandedKey(expanded ? null : opt.key)}
                            style={styles.menuRow}
                          >
                            <MaterialIcons
                              name={expanded ? 'arrow-drop-down' : 'arrow-right'}
                              size={20}
                              color={activeChild ? NAVY : '#94a3b8'}
                            />
                            <Text
                              style={[
                                styles.menuRowText,
                                activeChild && { color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
                              ]}
                            >
                              {opt.label}
                              {activeChild ? ` · ${activeChild.label}` : ''}
                            </Text>
                          </TouchableOpacity>
                          {expanded ? (
                            <View style={styles.menuChildren}>
                              {(opt.children || []).map((child) => {
                                const isCustom = child.key === 'date:custom';
                                const checked = arr.includes(child.key);
                                return (
                                  <TouchableOpacity
                                    key={child.key}
                                    activeOpacity={0.75}
                                    onPress={() => {
                                      if (isCustom) {
                                        openCustomDateFlow();
                                      } else if (menuOpen === 'filter') {
                                        toggleFilter(child.key);
                                      } else {
                                        toggleGroupBy(child.key);
                                      }
                                    }}
                                    style={[styles.menuRow, styles.menuChildRow]}
                                  >
                                    <MaterialIcons
                                      name={checked ? 'check-box' : 'check-box-outline-blank'}
                                      size={18}
                                      color={checked ? NAVY : '#cbd5e1'}
                                    />
                                    <Text style={styles.menuRowText}>{child.label}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      );
                    }
                    // type: 'leaf' — plain checkbox row.
                    const arr = menuOpen === 'filter' ? selectedFilters : selectedGroupBys;
                    const checked = arr.includes(opt.key);
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        activeOpacity={0.75}
                        onPress={() => (menuOpen === 'filter' ? toggleFilter(opt.key) : toggleGroupBy(opt.key))}
                        style={styles.menuRow}
                      >
                        <MaterialIcons
                          name={checked ? 'check-box' : 'check-box-outline-blank'}
                          size={18}
                          color={checked ? NAVY : '#cbd5e1'}
                        />
                        <Text style={styles.menuRowText}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {menuOpen === 'group' && groupByOptionsForTab.length === 0 ? (
                    <Text style={[styles.menuRowText, { padding: 14, color: MUTED }]}>
                      No grouping options apply to this tab.
                    </Text>
                  ) : null}
                </ScrollView>
                {(menuOpen === 'filter' && selectedFilters.length > 0) ||
                 (menuOpen === 'group' && selectedGroupBys.length > 0) ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.menuClearBtn}
                    onPress={() => {
                      if (menuOpen === 'filter') setSelectedFilters([]);
                      else setSelectedGroupBys([]);
                    }}
                  >
                    <MaterialIcons name="clear-all" size={14} color="#fff" />
                    <Text style={styles.menuClearText}>Clear all</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
};

export default SalesReportScreen;

const cardShadow = Platform.select({
  ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  // Calendar popup
  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: Math.min(Dimensions.get('window').height * 0.85, 600),
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 14 },
    }),
  },
  calendarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f5',
  },
  calendarTitle: {
    fontSize: 16,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  calendarSubtitle: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  calendarCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  fromToRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 8,
  },
  fromToCell: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  fromToCellActive: {
    borderColor: NAVY,
    backgroundColor: '#f5f4ff',
  },
  fromToLabel: {
    fontSize: 10,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  fromToValue: {
    fontSize: 13,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    marginTop: 2,
  },
  fromToArrow: {
    paddingHorizontal: 2,
  },

  exportRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    gap: 4,
  },
  exportBtnPdf: { backgroundColor: '#DC2626' },
  exportBtnXls: { backgroundColor: '#16A34A' },
  exportBtnText: {
    fontSize: 11,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  // Hero KPI card
  heroCard: {
    backgroundColor: NAVY,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    ...cardShadow,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  heroAmount: {
    fontSize: 30,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  heroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    gap: 2,
  },
  deltaBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  heroDisk: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  heroStatIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatValue: {
    fontSize: 13,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  heroStatLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },

  // Section headers
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 15,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  sectionLink: {
    fontSize: 12,
    color: ORANGE,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  fallbackHint: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginBottom: 8,
    paddingHorizontal: 4,
    fontStyle: 'italic',
  },

  cardList: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
    ...cardShadow,
  },

  // Product rows
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  rankDisk: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 13,
    color: '#92400E',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eef0f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerInitial: {
    fontSize: 13,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  productName: {
    fontSize: 14,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  productMeta: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  productBarTrack: {
    height: 4,
    backgroundColor: '#eef0f5',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  productBarFill: {
    height: 4,
    backgroundColor: ORANGE,
    borderRadius: 2,
  },
  productRevenue: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginLeft: 8,
  },

  // Payments
  payCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  payHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eef0f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payName: {
    fontSize: 14,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  payMeta: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },
  payAmount: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  payPct: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  payBarTrack: {
    height: 6,
    backgroundColor: '#eef0f5',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  payBarFill: {
    height: 6,
    backgroundColor: NAVY,
    borderRadius: 3,
  },

  // P&L card (vertical ledger on a navy card)
  pnlCard: {
    backgroundColor: NAVY,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    ...cardShadow,
  },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  pnlLabel: {
    fontSize: 13,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistMedium,
    flexShrink: 1,
  },
  pnlLabelStrong: {
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  pnlValue: {
    fontSize: 14,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  pnlValueStrong: {
    fontSize: 16,
  },
  pnlDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 4,
  },
  marginPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  marginPillText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  pnlNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  pnlNoteText: {
    flex: 1,
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    lineHeight: 15,
  },

  // ── Odoo-style Filter / Group By bar ──
  // ── Top-level mode switcher (Overview / Filters & Group By) ──
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#eef0f5',
    borderRadius: 999,
    padding: 4,
    marginBottom: 10,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: NAVY,
  },
  modeBtnText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  modeBtnTextActive: { color: '#fff' },

  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  filterBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  filterBarPillActive: {
    backgroundColor: NAVY,
  },
  filterBarPillText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  filterBarPillTextActive: { color: '#fff' },

  activeChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
    marginBottom: 8,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ORANGE,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  activeChipGroup: { backgroundColor: NAVY },
  activeChipText: {
    fontSize: 11,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },

  // ── View mode toggle (List / Graph / Pivot) ──
  viewModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef0f5',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  viewModeBtn: {
    width: 30,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeBtnActive: {
    backgroundColor: NAVY,
  },

  // ── Measures pill (Analysis + Pivot only) ──
  exportBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    marginLeft: 6,
  },
  exportBarPillActive: {
    backgroundColor: NAVY,
  },
  exportBarPillText: {
    fontSize: 11,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  exportBarPillTextActive: { color: '#fff' },

  // ── Flip Axis button ──
  flipBtn: {
    width: 30,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef0f5',
    marginLeft: 6,
  },
  flipBtnActive: {
    backgroundColor: NAVY,
  },

  // ── Filter / Group By menu modal ──
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  menuCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 12 },
    }),
  },
  menuHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f5',
  },
  menuTitle: {
    fontSize: 15,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f5f9',
  },
  menuRowText: {
    fontSize: 13,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  menuChildren: {
    backgroundColor: '#f9fafc',
  },
  menuChildRow: {
    paddingLeft: 36,
    borderBottomColor: '#eef0f5',
  },
  menuClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: NAVY,
    paddingVertical: 10,
  },
  menuClearText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  // ── Pivot table ──
  pivotTable: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    ...cardShadow,
  },
  pivotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  pivotHeadRow: { backgroundColor: NAVY },
  pivotTotalRow: { backgroundColor: '#fef3c7' },
  pivotCell: {
    width: 110,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 12,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'right',
  },
  pivotCellLabel: {
    width: 180,
    textAlign: 'left',
  },
  pivotCellMoney: {
    fontFamily: FONT_FAMILY.urbanistBold,
    color: NAVY,
  },
  pivotCellLink: {
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    textDecorationLine: 'underline',
  },
  pivotHeadText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  pivotHeadTextLink: {
    textDecorationLine: 'underline',
  },
  pivotTotalText: {
    color: '#92400E',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },

  // ── Drill-down Modal rows ──
  drillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
    gap: 10,
  },
  drillOrderName: {
    fontSize: 13,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  drillMeta: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  drillTotal: {
    fontSize: 13,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  drillQty: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },

  // ── Graph card ──
  graphCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
    alignItems: 'center',
    ...cardShadow,
  },
  graphFootnote: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 6,
  },

  // Empty
  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 32,
    alignItems: 'center',
    marginBottom: 14,
    ...cardShadow,
  },
  emptyText: {
    fontSize: 13,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 8,
  },
});
