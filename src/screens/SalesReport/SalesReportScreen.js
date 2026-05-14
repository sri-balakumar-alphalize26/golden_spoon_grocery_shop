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
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { NavigationHeader } from '@components/Header';
import {
  fetchSalesReportData,
  fetchTopProducts,
  fetchPaymentMethods,
  fetchSalesProfitOdoo,
  fetchOperatingExpensesOdoo,
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

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 Days' },
  { key: 'month', label: '30 Days' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'dashboard' },
  { key: 'products', label: 'Top Products', icon: 'shopping-cart' },
  { key: 'customers', label: 'Top Customers', icon: 'people' },
  { key: 'payments', label: 'Payments', icon: 'payment' },
  { key: 'pnl', label: 'P&L', icon: 'trending-up' },
];

const isoDateOnly = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const prettyDateLabel = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Pick a date';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const SalesReportScreen = ({ navigation }) => {
  const currency = useAuthStore((state) => state.currency);
  const decimalAccuracy = useAuthStore((state) => state.decimalAccuracy);
  useEffect(() => { console.log('[CURRENCY:RENDER] SalesReportScreen', currency); }, [currency]);
  useEffect(() => { console.log('[CURRENCY:RENDER] SalesReportScreen decimalAccuracy=', decimalAccuracy); }, [decimalAccuracy]);
  const fallbackCurrency = { symbol: '', name: '', position: 'before' };

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [selectedTab, setSelectedTab] = useState('overview');
  const [salesData, setSalesData] = useState(null);
  const [previousSummary, setPreviousSummary] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [opex, setOpex] = useState(0);

  // Custom date range — only used when selectedPeriod === 'custom'.
  const todayStr = isoDateOnly(new Date());
  const [customStart, setCustomStart] = useState(todayStr);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [calendarOpen, setCalendarOpen] = useState(null); // 'from' | 'to' | null

  // Export state
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);

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

  const getDateRange = (period) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let startDate;
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    switch (period) {
      case 'today': startDate = new Date(today); break;
      case 'week': startDate = new Date(today); startDate.setDate(today.getDate() - 7); break;
      case 'month': startDate = new Date(today); startDate.setMonth(today.getMonth() - 1); break;
      case 'all': return { startDate: null, endDate: null };
      case 'custom': {
        const s = parseIsoDate(customStart);
        const e = parseIsoDate(customEnd);
        if (!s || !e) return { startDate: null, endDate: null };
        const eEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59);
        return { startDate: fmtDt(s), endDate: fmtDt(eEnd) };
      }
      default: startDate = new Date(today);
    }
    return { startDate: fmtDt(startDate), endDate: fmtDt(endDate) };
  };

  // Previous-period range, same length as the current selection. Used to
  // compute the delta badge ("+12% vs prev"). For All Time we don't compare.
  const getPreviousRange = (period) => {
    if (period === 'all') return { startDate: null, endDate: null, label: '' };
    const cur = getDateRange(period);
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
      const range = getDateRange(selectedPeriod);
      const prev = getPreviousRange(selectedPeriod);
      const [sales, products, payments, prevSales, profit, opexTotal] = await Promise.all([
        fetchSalesReportData(range),
        fetchTopProducts({ ...range, limit: 10 }),
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
    if (hasLoadedRef.current) fetchReportData();
    // For custom period, also refire whenever the user edits the date inputs.
  }, [selectedPeriod, customStart, customEnd]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReportData(false);
  }, [selectedPeriod]);

  const fmtMoney = (n) => formatCurrencyUtil(n || 0, currency || fallbackCurrency);

  const periodLabel = (PERIODS.find((p) => p.key === selectedPeriod) || PERIODS[0]).label;

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

  const buildHtml = () => {
    const summary = salesData?.summary || {};
    const rangeLabel = selectedPeriod === 'custom'
      ? `${customStart} → ${customEnd}`
      : periodLabel;
    const head = `
      <div style="margin-bottom:18px;">
        <div style="font-size:22px;font-weight:800;color:#2E294E;letter-spacing:0.3px;">Sales Report — ${escapeHtml(rangeLabel)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">Generated: ${escapeHtml(new Date().toLocaleString('en-US'))}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
        <tr>
          <td style="padding:8px 10px;background:#fafbfc;border:1px solid #eef0f5;"><b>Total Sales</b><br/>${escapeHtml(fmtMoney(summary.totalSales))}</td>
          <td style="padding:8px 10px;background:#fafbfc;border:1px solid #eef0f5;"><b>Orders</b><br/>${formatNumber(summary.totalOrders || 0)}</td>
          <td style="padding:8px 10px;background:#fafbfc;border:1px solid #eef0f5;"><b>Avg Order</b><br/>${escapeHtml(fmtMoney(summary.averageOrder))}</td>
          <td style="padding:8px 10px;background:#fafbfc;border:1px solid #eef0f5;"><b>Tax</b><br/>${escapeHtml(fmtMoney(summary.totalTax))}</td>
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
        </body>
      </html>
    `;
  };

  const buildCsv = () => {
    const summary = salesData?.summary || {};
    const lines = [];
    const rangeLabel = selectedPeriod === 'custom'
      ? `${customStart} → ${customEnd}`
      : periodLabel;
    lines.push(['Sales Report', rangeLabel].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Metric', 'Value'].map(csvEscape).join(','));
    lines.push(['Total Sales', summary.totalSales || 0].map(csvEscape).join(','));
    lines.push(['Orders', summary.totalOrders || 0].map(csvEscape).join(','));
    lines.push(['Avg Order', summary.averageOrder || 0].map(csvEscape).join(','));
    lines.push(['Tax', summary.totalTax || 0].map(csvEscape).join(','));
    lines.push('');
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
      const fileName = `sales-${selectedPeriod}-${tsForFile()}.pdf`;
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
      const fileName = `sales-${selectedPeriod}-${tsForFile()}.csv`;
      await saveFile({ content: csv, fileName, mimeType: 'text/csv', isBase64: false });
    } catch (e) {
      console.warn('Sales Excel export failed:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Could not export Excel', text2: e?.message || '', position: 'bottom' });
    } finally {
      setXlsBusy(false);
    }
  };

  // ───── Period segmented control ─────
  const renderPeriod = () => (
    <View>
      <View style={styles.periodWrap}>
        {PERIODS.map((p) => {
          const active = selectedPeriod === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              activeOpacity={0.85}
              onPress={() => setSelectedPeriod(p.key)}
              style={[styles.periodBtn, active && styles.periodBtnActive]}
            >
              <Text style={[styles.periodBtnText, active && styles.periodBtnTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedPeriod === 'custom' ? (
        <View style={styles.customRangeRow}>
          <TouchableOpacity
            style={styles.customRangeCell}
            activeOpacity={0.85}
            onPress={() => setCalendarOpen('from')}
          >
            <Text style={styles.customRangeLabel}>FROM</Text>
            <View style={styles.customRangeBtnInner}>
              <Text style={styles.customRangeInput}>{prettyDateLabel(customStart)}</Text>
              <MaterialIcons name="calendar-today" size={14} color={MUTED} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.customRangeCell}
            activeOpacity={0.85}
            onPress={() => setCalendarOpen('to')}
          >
            <Text style={styles.customRangeLabel}>TO</Text>
            <View style={styles.customRangeBtnInner}>
              <Text style={styles.customRangeInput}>{prettyDateLabel(customEnd)}</Text>
              <MaterialIcons name="calendar-today" size={14} color={MUTED} />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  // ───── Hero KPI strip ─────
  const renderHero = () => {
    const summary = salesData?.summary || {};
    const total = summary.totalSales || 0;
    const orders = summary.totalOrders || 0;
    const avg = summary.averageOrder || 0;
    const tax = summary.totalTax || 0;

    return (
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>TOTAL SALES</Text>
            <Text style={styles.heroAmount}>{fmtMoney(total)}</Text>
            <View style={styles.heroSubRow}>
              <Text style={styles.heroSub}>{periodLabel}</Text>
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
            onPress={() => navigation.navigate('OrdersAnalysis', { period: selectedPeriod, ordersData: salesData })}
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

          <View style={styles.heroStat}>
            <View style={styles.heroStatIconWrap}>
              <MaterialIcons name="account-balance" size={16} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroStatValue}>{fmtMoney(tax)}</Text>
              <Text style={styles.heroStatLabel}>Tax</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // ───── Tab pills + export buttons (opposite the tabs) ─────
  const renderTabs = () => (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {TABS.map((t) => {
          const active = selectedTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              activeOpacity={0.85}
              onPress={() => setSelectedTab(t.key)}
            >
              <MaterialIcons name={t.icon} size={16} color={active ? '#fff' : NAVY} />
              <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.exportRow}>
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
  const renderBody = () => {
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
          {renderPeriod()}
          {renderTabs()}
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
                  <Text style={styles.calendarTitle}>
                    {calendarOpen === 'from' ? 'Pick start date' : 'Pick end date'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCalendarOpen(null)}
                    style={styles.calendarCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="close" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>
                <Calendar
                  current={calendarOpen === 'from' ? customStart : customEnd}
                  maxDate={isoDateOnly(new Date())}
                  onDayPress={({ dateString }) => {
                    if (calendarOpen === 'from') {
                      let from = dateString;
                      let to = customEnd;
                      if (from > to) { to = from; }
                      setCustomStart(from);
                      setCustomEnd(to);
                    } else {
                      let to = dateString;
                      let from = customStart;
                      if (to < from) { from = to; }
                      setCustomEnd(to);
                      setCustomStart(from);
                    }
                    setCalendarOpen(null);
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
    </SafeAreaView>
  );
};

export default SalesReportScreen;

const cardShadow = Platform.select({
  ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  // Period segmented control
  periodWrap: {
    flexDirection: 'row',
    backgroundColor: '#eef0f5',
    borderRadius: 999,
    padding: 4,
    marginBottom: 12,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  periodBtnActive: {
    backgroundColor: NAVY,
  },
  periodBtnText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  periodBtnTextActive: { color: '#fff' },

  customRangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  customRangeCell: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  customRangeLabel: {
    fontSize: 10,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.5,
  },
  customRangeBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  customRangeInput: {
    fontSize: 13,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    padding: 0,
    flex: 1,
  },

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
  calendarCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    gap: 6,
  },
  tabBtnActive: { backgroundColor: NAVY, borderColor: NAVY },
  tabBtnText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  tabBtnTextActive: { color: '#fff' },

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
