import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import { FABButton } from '@components/common/Button';
import { FeatureGate } from '@components/FeatureGate';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import {
  fetchExpensesOdoo,
  fetchExpenseTotalsOdoo,
  fetchCurrentEmployeeIdOdoo,
} from '@api/services/generalApi';
import { refreshCurrencyFromStorage } from '@api/services/currencyApi';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import { buildExpenseReportHtml, buildExpenseReportCsv } from '@utils/expenseExportHtml';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

// Each filter chip carries the same colour palette as the row's status
// badge so the cashier sees Submitted/Approved/Paid/Refused chips in the
// same colour that lights up on the rows themselves. `bg` is the active
// fill, `border` the inactive outline, `fg` the text on the active
// (filled) state. Inactive text uses the same `border` colour.
const FILTERS = [
  { key: 'all',      label: 'All',       bg: COLORS.primaryThemeColor, border: COLORS.primaryThemeColor, fg: '#fff'    },
  { key: 'draft',    label: 'Draft',     bg: '#0EA5E9', border: '#7DD3FC', fg: '#fff' },
  { key: 'reported', label: 'Submitted', bg: '#F59E0B', border: '#FCD34D', fg: '#1a1a2e' },
  { key: 'approved', label: 'Approved',  bg: '#16A34A', border: '#86EFAC', fg: '#fff' },
  { key: 'done',     label: 'Paid',      bg: '#6B7280', border: '#D1D5DB', fg: '#fff' },
  { key: 'refused',  label: 'Refused',   bg: '#DC2626', border: '#FCA5A5', fg: '#fff' },
];

// Newer Odoo (17+) reports `state = 'submitted'` / `'paid'` while older
// Odoo uses `'reported'` / `'done'` for the same logical states. Include
// both keys here so the colored pill renders correctly regardless of the
// connected database's version.
const STATE_BADGE = {
  draft:     { bg: '#E0F2FE', fg: '#075985', label: 'Draft' },
  reported:  { bg: '#FEF3C7', fg: '#92400E', label: 'Submitted' },
  submitted: { bg: '#FEF3C7', fg: '#92400E', label: 'Submitted' },
  approved:  { bg: '#DCFCE7', fg: '#166534', label: 'Approved' },
  done:      { bg: '#E5E7EB', fg: '#374151', label: 'Paid' },
  paid:      { bg: '#E5E7EB', fg: '#374151', label: 'Paid' },
  refused:   { bg: '#FEE2E2', fg: '#B91C1C', label: 'Refused' },
};

const formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ExpensesScreen = ({ navigation }) => {
  const authUser = useAuthStore((state) => state.user);
  const currency = useAuthStore((state) => state.currency) || { symbol: '', name: '', position: 'before' };
  const decimalAccuracy = useAuthStore((state) => state.decimalAccuracy);
  useEffect(() => { console.log('[CURRENCY:RENDER] ExpensesScreen', currency); }, [currency]);
  useEffect(() => { console.log('[CURRENCY:RENDER] ExpensesScreen decimalAccuracy=', decimalAccuracy); }, [decimalAccuracy]);

  // FORCE-refresh currency from Odoo every time this screen receives focus
  // (independent of App boot — survives Fast Refresh and back-navigation).
  useFocusEffect(useCallback(() => {
    console.log('[CURRENCY:RENDER] ExpensesScreen focus — forcing refresh');
    refreshCurrencyFromStorage().then((cfg) => {
      if (cfg) useAuthStore.getState().setCurrency(cfg);
    }).catch(() => {});
  }, []));

  const [employee, setEmployee] = useState(null);
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState({ to_submit: 0, waiting_approval: 0, waiting_reimbursement: 0 });
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    () => loadList(employee?.id),
    400
  );

  // Resolve hr.employee on mount.
  useEffect(() => {
    const uid = authUser?.uid || authUser?.id;
    if (!uid) return;
    fetchCurrentEmployeeIdOdoo(uid).then((emp) => setEmployee(emp));
  }, [authUser]);

  // Odoo splits the dashboard view: the totals at the top compute against
  // the logged-in user only, while the LIST shows every expense the user
  // can read (admins see all employees they manage). Mirror that here —
  // pass employeeId to the totals fetch but not to the list fetch.
  const loadList = useCallback(async (employeeId) => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const [rows, sums] = await Promise.all([
        fetchExpensesOdoo({ searchText, state: null, limit: 500 }),
        fetchExpenseTotalsOdoo({ employeeId }),
      ]);
      setData(rows || []);
      setTotals(sums || { to_submit: 0, waiting_approval: 0, waiting_reimbursement: 0 });
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useFocusEffect(
    useCallback(() => {
      if (employee?.id) loadList(employee.id);
    }, [employee?.id, loadList])
  );

  // Client-side filter — bucket each row's state under the canonical chip
  // key so the chip narrows the visible list regardless of which Odoo
  // version's state vocabulary the server returned.
  const FILTER_GROUPS = {
    draft: ['draft'],
    reported: ['reported', 'submitted'],
    approved: ['approved'],
    done: ['done', 'paid'],
    refused: ['refused'],
  };
  const visibleData = filter === 'all'
    ? data
    : data.filter((row) => (FILTER_GROUPS[filter] || [filter]).includes(row.state));

  // Footer total updates as the filter chip / search changes, since it
  // sums whatever's currently in visibleData.
  const visibleTotal = visibleData.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const filterLabel = (FILTERS.find((f) => f.key === filter) || {}).label || 'All';
  const filterSlug = String(filter || 'all').replace(/_/g, '-');

  const tsForFile = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  // Persist a file the user picked a save destination for. On Android we use
  // the StorageAccessFramework so the user gets a real "pick a folder" dialog.
  // On iOS (no SAF) we fall back to Sharing.shareAsync, whose share sheet
  // already exposes "Save to Files". Mirrors StockScreen's saveFile().
  const saveFile = async ({ srcUri, content, fileName, mimeType, isBase64 = false }) => {
    if (Platform.OS === 'android') {
      try {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perm?.granted) {
          const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
            perm.directoryUri,
            fileName,
            mimeType
          );
          let payload = content;
          let encoding = FileSystem.EncodingType.UTF8;
          if (isBase64) {
            payload = await FileSystem.readAsStringAsync(srcUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
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
      await FileSystem.writeAsStringAsync(uriToShare, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
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
      const formatAmount = (n) => formatCurrency(n, currency);
      const html = buildExpenseReportHtml(visibleData, formatAmount, {
        filterLabel,
        totalFormatted: formatAmount(visibleTotal),
        searchText,
      });
      const { uri } = await Print.printToFileAsync({ html });
      const fileName = `expenses-${filterSlug}-${tsForFile()}.pdf`;
      await saveFile({ srcUri: uri, fileName, mimeType: 'application/pdf', isBase64: true });
    } catch (e) {
      console.warn('PDF export failed:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Could not export PDF', text2: e?.message || '', position: 'bottom' });
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportExcel = async () => {
    if (pdfBusy || xlsBusy) return;
    setXlsBusy(true);
    try {
      const formatAmount = (n) => formatCurrency(n, currency);
      const csv = buildExpenseReportCsv(visibleData, formatAmount, {
        totalFormatted: formatAmount(visibleTotal),
      });
      const fileName = `expenses-${filterSlug}-${tsForFile()}.csv`;
      await saveFile({ content: csv, fileName, mimeType: 'text/csv', isBase64: false });
    } catch (e) {
      console.warn('Excel export failed:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Could not export Excel', text2: e?.message || '', position: 'bottom' });
    } finally {
      setXlsBusy(false);
    }
  };

  const renderTotalsCard = () => (
    // Each stat card is tappable — mirrors Odoo's web UI where clicking
    // "Waiting Approval" filters the list to that bucket. Tapping the same
    // active card again reverts to "All" so the user can clear the filter
    // without hunting for the chip row below.
    <View style={styles.totalsCard}>
      <TouchableOpacity
        style={[styles.totalCol, filter === 'draft' && styles.totalColActive]}
        activeOpacity={0.7}
        onPress={() => setFilter(filter === 'draft' ? 'all' : 'draft')}
      >
        <Text style={[styles.totalAmount, filter === 'draft' && { color: NAVY }]}>
          {formatCurrency(totals.to_submit, currency)}
        </Text>
        <Text style={styles.totalLabel}>To Submit</Text>
      </TouchableOpacity>
      <View style={styles.totalDivider}>
        <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
      </View>
      <TouchableOpacity
        style={[styles.totalCol, filter === 'reported' && styles.totalColActive]}
        activeOpacity={0.7}
        onPress={() => setFilter(filter === 'reported' ? 'all' : 'reported')}
      >
        <Text style={[styles.totalAmount, filter === 'reported' && { color: NAVY }]}>
          {formatCurrency(totals.waiting_approval, currency)}
        </Text>
        <Text style={styles.totalLabel}>Waiting Approval</Text>
      </TouchableOpacity>
      <View style={styles.totalDivider}>
        <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
      </View>
      <TouchableOpacity
        style={[styles.totalCol, filter === 'approved' && styles.totalColActive]}
        activeOpacity={0.7}
        onPress={() => setFilter(filter === 'approved' ? 'all' : 'approved')}
      >
        <Text style={[styles.totalAmount, filter === 'approved' && { color: NAVY }]}>
          {formatCurrency(totals.waiting_reimbursement, currency)}
        </Text>
        <Text style={styles.totalLabel}>Waiting Reimbursement</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ flex: 1 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.85}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterPill,
                { borderColor: f.border },
                active && { backgroundColor: f.bg, borderColor: f.bg },
              ]}
            >
              <Text style={[
                styles.filterPillText,
                { color: f.border },
                active && { color: f.fg },
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.exportGroup}>
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnPdf, (pdfBusy || xlsBusy) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={pdfBusy || xlsBusy}
          onPress={handleExportPdf}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnXls, (pdfBusy || xlsBusy) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={pdfBusy || xlsBusy}
          onPress={handleExportExcel}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
      </View>
    </View>
  );

  const renderItem = useCallback(({ item }) => {
    const badge = STATE_BADGE[item.state] || STATE_BADGE.draft;
    const initial = (item.employee?.name || '?').trim().charAt(0).toUpperCase() || '?';
    const paidByLabel = item.payment_mode === 'company_account'
      ? 'Company'
      : 'Employee (to reimburse)';
    const pmName = Array.isArray(item.payment_method_id) ? item.payment_method_id[1] : null;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.row}
        onPress={() => navigation.navigate('ExpenseDetail', { expenseId: item.id })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name || '—'}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {formatDate(item.date)} · {item.category?.name || 'No category'}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {paidByLabel}{pmName ? ` · ${pmName}` : ''}
          </Text>
        </View>
        <View style={styles.rightCol}>
          {/* Paperclip + count when this expense has receipts attached.
              Mirrors Odoo's list view — visible icon next to the amount
              for any row with at least one attachment. */}
          {item.message_attachment_count > 0 ? (
            <View style={styles.attachChip}>
              <MaterialIcons name="attach-file" size={15} color={NAVY} />
              <Text style={styles.attachChipText}>{item.message_attachment_count}</Text>
            </View>
          ) : null}
          <Text style={styles.rowAmount}>
            {formatCurrency(item.total_amount, currency)}
          </Text>
          <View style={[styles.statePill, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statePillText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation, currency]);

  const keyExtractor = useCallback((item, index) => `expense-${item.id || index}`, []);

  const renderList = () => {
    if (loading && (!data || data.length === 0)) return null;
    if (visibleData.length === 0 && !loading) {
      // Tailor the empty message — "no rows at all" vs "no rows for the
      // chosen status" — so the cashier knows whether the filter is
      // hiding rows or there's genuinely nothing to show.
      const message = data.length === 0
        ? 'No expenses yet'
        : `No ${(FILTERS.find((f) => f.key === filter)?.label || '').toLowerCase()} expenses`;
      return (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty_data.png')}
          message={message}
        />
      );
    }
    return (
      <FlashList
        data={visibleData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: 8, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={88}
      />
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Expenses" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder="Search Expenses"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      <RoundedContainer>
        {renderTotalsCard()}
        {renderFilters()}
        <View style={{ flex: 1 }}>{renderList()}</View>
        {visibleData.length > 0 ? (
          <View style={styles.footerBar}>
            <Text style={styles.footerLabel}>Total ({filterLabel})</Text>
            <Text style={styles.footerAmount}>{formatCurrency(visibleTotal, currency)}</Text>
          </View>
        ) : null}
        {!employee && !loading ? (
          <View style={styles.noEmployeeBanner}>
            <MaterialIcons name="info-outline" size={16} color="#92400E" />
            <Text style={styles.noEmployeeText}>
              Your user isn't linked to an employee yet — ask your admin to link an HR Employee record before filing expenses.
            </Text>
          </View>
        ) : null}
        {employee ? (
          <FeatureGate featureKey="expenses.create">
            <FABButton
              onPress={() => navigation.navigate('ExpenseForm')}
              style={{ bottom: 56 }}
            />
          </FeatureGate>
        ) : null}
      </RoundedContainer>
      <OverlayLoader visible={loading && (!data || data.length === 0)} />
    </SafeAreaView>
  );
};

export default ExpensesScreen;

const styles = StyleSheet.create({
  totalsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 8,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  totalCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 6, borderRadius: 8 },
  // Active stat column — soft navy tint so the cashier can see at a glance
  // which bucket the list is filtered to.
  totalColActive: { backgroundColor: '#EEF2FF' },
  totalAmount: {
    fontSize: 16,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  totalLabel: {
    fontSize: 10,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
    textAlign: 'center',
  },
  totalDivider: { width: 16, alignItems: 'center', justifyContent: 'center' },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingTop: 6,
    paddingBottom: 6,
  },
  exportGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#eef0f5',
    marginLeft: 6,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 999,
    gap: 4,
  },
  exportBtnPdf: {
    backgroundColor: '#DC2626',
  },
  exportBtnXls: {
    backgroundColor: '#16A34A',
  },
  exportBtnText: {
    fontSize: 11,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    marginVertical: 5,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
    }),
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#eef0f5',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    color: NAVY,
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  rowName: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  rowMeta: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  rowSub: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },
  rightCol: { alignItems: 'flex-end', marginLeft: 8 },
  // 📎 N — attachment count chip on each row (matches Odoo list view)
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  attachChipText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  rowAmount: {
    fontSize: 15,
    color: ORANGE,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  statePill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statePillText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eef0f5',
  },
  footerLabel: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    letterSpacing: 0.2,
  },
  footerAmount: {
    fontSize: 16,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  noEmployeeBanner: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  noEmployeeText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontFamily: FONT_FAMILY.urbanistMedium,
    lineHeight: 16,
  },
});
