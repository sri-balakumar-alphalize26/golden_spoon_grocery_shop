// Accounting → Invoices list. Mirrors Odoo's Accounting → Customers →
// Invoices page in the app — each row is one `account.move` (move_type in
// out_invoice / out_refund). Reuses the same visual language as
// MyOrdersScreen for consistency.
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { FONT_FAMILY } from '@constants/theme';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { fetchCustomerInvoicesOdoo, fetchInvoiceDetailOdoo } from '@api/services/generalApi';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import TaxBreakdownModal from '@components/Modal/TaxBreakdownModal';
import InvoiceFiltersModal from '@components/Modal/InvoiceFiltersModal';
import InvoiceGroupByModal from '@components/Modal/InvoiceGroupByModal';
import { SectionList } from 'react-native';
import { FeatureGate } from '@components/FeatureGate';

const STATE_FILTERS = [
  { key: 'all',    states: [],                       label: 'All' },
  { key: 'posted', states: ['posted'],               label: 'Posted' },
  { key: 'draft',  states: ['draft'],                label: 'Draft' },
  { key: 'cancel', states: ['cancel'],               label: 'Cancelled' },
];

const formatDate = (dateString) => {
  if (!dateString) return '—';
  const d = new Date(String(dateString).includes('T') ? dateString : `${dateString}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const stateColor = (state, paymentState) => {
  if (paymentState === 'paid') return '#16a34a';
  if (paymentState === 'partial') return '#d97706';
  switch (state) {
    case 'posted': return '#2563eb';
    case 'draft':  return '#6b7280';
    case 'cancel': return '#dc2626';
    default:       return '#6b7280';
  }
};

// Reshape rows into [{ title, data: [] }] sections for the SectionList
// when a group-by key is selected. Keyed by salesperson / partner /
// status / payment_method / journal.
const groupRows = (rows, key) => {
  if (!key || !Array.isArray(rows) || rows.length === 0) return [];
  const pick = (row) => {
    switch (key) {
      case 'salesperson':    return Array.isArray(row.invoice_user_id) ? row.invoice_user_id[1] : 'No Salesperson';
      case 'partner':        return Array.isArray(row.partner_id) ? row.partner_id[1] : 'No Partner';
      case 'status':         return row.state || '—';
      case 'payment_method': return row.payment_state || '—';
      case 'journal':        return Array.isArray(row.journal_id) ? row.journal_id[1] : '—';
      default:               return '—';
    }
  };
  const map = new Map();
  for (const r of rows) {
    const title = String(pick(r) || '—');
    if (!map.has(title)) map.set(title, []);
    map.get(title).push(r);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
};

const stateLabel = (state, paymentState, moveType) => {
  if (paymentState === 'paid') return 'Paid';
  if (paymentState === 'partial') return 'Partially Paid';
  if (state === 'posted') return moveType === 'out_refund' ? 'Posted (Credit Note)' : 'Posted';
  if (state === 'draft') return 'Draft';
  if (state === 'cancel') return 'Cancelled';
  return state;
};

const InvoicesListScreen = ({ navigation }) => {
  const currency = useAuthStore((s) => s.currency);
  const [stateFilter, setStateFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE = 50;
  // Filter modal — selected keys persist across opens; resolved filter
  // payload is applied to fetchCustomerInvoicesOdoo via `filterPayload`.
  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [filterKeys, setFilterKeys] = useState([]);
  const [filterPayload, setFilterPayload] = useState({
    states: [], paymentStates: [], moveTypes: [], overdueOnly: false,
  });
  // Group By — single key like 'salesperson' / 'partner' / 'status' /
  // 'payment_method' / 'journal'. When set, the list switches from
  // FlatList to SectionList with rows grouped by that key.
  const [groupByModalVisible, setGroupByModalVisible] = useState(false);
  const [groupBy, setGroupBy] = useState(null);
  // Tax breakdown modal (mirror MyOrdersScreen) — taps on the Tax chip
  // open this modal with the per-line subtotal/tax detail.
  const [taxModalVisible, setTaxModalVisible] = useState(false);
  const [taxModalInvoice, setTaxModalInvoice] = useState(null);
  const [taxModalLoading, setTaxModalLoading] = useState(false);

  const openTaxModal = useCallback(async (inv) => {
    setTaxModalInvoice({ ...inv, lines: [] });
    setTaxModalVisible(true);
    setTaxModalLoading(true);
    try {
      const resp = await fetchInvoiceDetailOdoo(inv.id);
      if (resp && !resp.error && resp.result) {
        setTaxModalInvoice({ ...inv, ...resp.result });
      }
    } finally {
      setTaxModalLoading(false);
    }
  }, []);

  const activeStates = (STATE_FILTERS.find((f) => f.key === stateFilter)?.states) || [];

  const load = useCallback(async ({ searchText: q = '', resetOffset = true } = {}) => {
    if (resetOffset) {
      setLoading(true);
      setOffset(0);
    }
    try {
      // Merge legacy pill-row state filter (activeStates) with the
      // multi-select filter modal payload. The modal can override states
      // entirely; if it didn't pick any, fall back to the legacy pill.
      const states = filterPayload.states.length > 0
        ? filterPayload.states
        : activeStates;
      const list = await fetchCustomerInvoicesOdoo({
        offset: resetOffset ? 0 : offset,
        limit: PAGE,
        searchText: q,
        states,
        paymentStates: filterPayload.paymentStates,
        moveTypes: filterPayload.moveTypes,
        overdueOnly: filterPayload.overdueOnly,
      });
      if (resetOffset) {
        setRows(list || []);
      } else {
        setRows((prev) => [...prev, ...(list || [])]);
      }
      setHasMore((list || []).length === PAGE);
      if (resetOffset) setOffset(PAGE);
      else setOffset((o) => o + PAGE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeStates, offset, filterPayload]);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => load({ searchText: text, resetOffset: true }),
    500
  );

  useEffect(() => {
    load({ searchText, resetOffset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter, filterPayload]);

  // Auto-refresh on every focus so newly-posted invoices (e.g. ones the
  // user just created on the Payment screen) show up without manual
  // pull-to-refresh. Mirrors MyOrdersScreen's behaviour.
  useFocusEffect(
    useCallback(() => {
      load({ searchText, resetOffset: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchText, stateFilter, filterPayload])
  );

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    load({ searchText, resetOffset: false });
  };

  const renderItem = ({ item }) => {
    const partner = Array.isArray(item.partner_id) ? item.partner_id[1] : '—';
    const isRefund = item.move_type === 'out_refund';
    const total = Number(item.amount_total) || 0;
    const tax = Number(item.amount_tax) || 0;
    const residual = Number(item.amount_residual) || 0;
    const color = stateColor(item.state, item.payment_state);
    const label = stateLabel(item.state, item.payment_state, item.move_type);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('InvoiceDetailScreen', { invoiceId: item.id })}
      >
        <View style={styles.headerRow}>
          <View style={[styles.iconDisk, { backgroundColor: isRefund ? '#FEE2E2' : '#E7F1FD' }]}>
            <Icon name={isRefund ? 'undo' : 'description'} size={22} color={isRefund ? '#b91c1c' : '#1E88E5'} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.number}>{item.name || '—'}</Text>
            <View style={[styles.badge, { backgroundColor: color + '20' }]}>
              <Text style={[styles.badgeText, { color }]}>{label}</Text>
            </View>
          </View>
          <Text style={[styles.total, isRefund && { color: '#b91c1c' }]}>
            {formatCurrency(total, currency)}
          </Text>
        </View>
        <View style={styles.detailSection}>
          <View style={styles.detailRow}>
            <Icon name="person" size={14} color="#6b7280" />
            <Text style={styles.detailText}>{partner}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="event" size={14} color="#6b7280" />
            <Text style={styles.detailText}>{formatDate(item.invoice_date)}</Text>
          </View>
          {item.invoice_date_due ? (
            <View style={styles.detailRow}>
              <Icon name="schedule" size={14} color="#6b7280" />
              <Text style={styles.detailText}>{`Due: ${formatDate(item.invoice_date_due)}`}</Text>
            </View>
          ) : null}
          {tax > 0 ? (
            <TouchableOpacity
              style={styles.taxChip}
              activeOpacity={0.7}
              onPress={(e) => {
                e?.stopPropagation?.();
                openTaxModal(item);
              }}
            >
              <Icon name="receipt-long" size={12} color="#1E88E5" />
              <Text style={styles.taxChipText}>
                {`Tax ${formatCurrency(tax, currency)}`}
              </Text>
              <Icon name="chevron-right" size={14} color="#1E88E5" />
            </TouchableOpacity>
          ) : null}
          {residual > 0 ? (
            <View style={styles.dueChip}>
              <Icon name="schedule" size={12} color="#d97706" />
              <Text style={styles.dueChipText}>
                {`Due ${formatCurrency(residual, currency)}`}
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Invoices" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        searchText={searchText}
        onChangeText={handleSearchTextChange}
        placeholder="Search by invoice # or customer"
      />
      {/* Only the Filters + Group By buttons — no quick-state chip row.
          All state filtering (Draft/Posted/Cancelled etc.) lives inside
          the Filters popup. */}
      <View style={styles.filterBar}>
        <FeatureGate featureKey="accounting.invoice.filters">
          <TouchableOpacity
            style={styles.filtersBtn}
            activeOpacity={0.85}
            onPress={() => setFiltersModalVisible(true)}
          >
            <Icon name="filter-list" size={18} color="#1E88E5" />
            <Text style={styles.filtersBtnText}>
              {filterKeys.length > 0 ? `Filters (${filterKeys.length})` : 'Filters'}
            </Text>
          </TouchableOpacity>
        </FeatureGate>
        <FeatureGate featureKey="accounting.invoice.group_by">
          <TouchableOpacity
            style={[styles.filtersBtn, { marginLeft: 8 }]}
            activeOpacity={0.85}
            onPress={() => setGroupByModalVisible(true)}
          >
            <Icon name="layers" size={18} color="#1E88E5" />
            <Text style={styles.filtersBtnText}>
              {groupBy ? `Group: ${groupBy}` : 'Group By'}
            </Text>
          </TouchableOpacity>
        </FeatureGate>
      </View>
      <RoundedContainer>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#1E88E5" />
          </View>
        ) : groupBy ? (
          <SectionList
            sections={groupRows(rows, groupBy)}
            keyExtractor={(it, i) => `inv-${it.id || i}`}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
                <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
              </View>
            )}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => load({ searchText, resetOffset: true })}
              />
            }
          />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it, i) => `inv-${it.id || i}`}
            renderItem={renderItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => load({ searchText, resetOffset: true })}
              />
            }
            ListFooterComponent={loadingMore ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator color="#1E88E5" />
              </View>
            ) : null}
            ListEmptyComponent={(
              <EmptyState
                imageSource={require('@assets/images/EmptyData/empty_data.png')}
                title="No invoices"
                description="Customer invoices created from the POS will appear here."
              />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </RoundedContainer>
      <TaxBreakdownModal
        isVisible={taxModalVisible}
        order={taxModalInvoice}
        loading={taxModalLoading}
        currency={currency}
        onClose={() => setTaxModalVisible(false)}
      />
      <InvoiceFiltersModal
        isVisible={filtersModalVisible}
        initialSelected={filterKeys}
        onClose={() => setFiltersModalVisible(false)}
        onApply={(payload) => {
          setFilterKeys(payload.keys || []);
          setFilterPayload({
            states: payload.states || [],
            paymentStates: payload.paymentStates || [],
            moveTypes: payload.moveTypes || [],
            overdueOnly: !!payload.overdueOnly,
          });
          setFiltersModalVisible(false);
        }}
      />
      <InvoiceGroupByModal
        isVisible={groupByModalVisible}
        initialKey={groupBy}
        onClose={() => setGroupByModalVisible(false)}
        onApply={(key) => {
          setGroupBy(key);
          setGroupByModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // filterBar: Filters (left) + Group By (right) icon buttons. Lives
  // INSIDE RoundedContainer so it's not clipped by the rounded top
  // corners. Full-width white row with even vertical padding.
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  filterBarRight: { flexDirection: 'row', alignItems: 'center' },
  filtersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#E7F1FD',
  },
  filtersBtnText: {
    fontSize: 11,
    color: '#1E88E5',
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 4,
    flex: 1,
  },
  // Section header for the SectionList when Group By is active.
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#F5F8FE', borderBottomWidth: 1, borderBottomColor: '#BFDBFE',
  },
  sectionHeaderText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#1E88E5' },
  sectionHeaderCount: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#1E88E5' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  filterChipActive: { backgroundColor: '#1E88E5', borderColor: '#1E88E5' },
  filterText: { color: '#374151', fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#fff' },

  loadingBox: { paddingVertical: 32, alignItems: 'center' },

  // Card matches MyOrdersScreen.renderOrderItem look: 48x48 disk on left,
  // number + status pill stacked in the middle, amount right; bordered
  // detail section below for partner / invoice date / due date / chips.
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  iconDisk: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  number: { fontSize: 15, fontWeight: '700', color: '#111827' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  total: { fontSize: 15, fontWeight: '700', color: '#111827' },
  detailSection: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  detailText: { color: '#4b5563', fontSize: 12 },
  taxChip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E7F1FD', borderColor: '#BFDBFE', borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6,
  },
  taxChipText: { color: '#1E88E5', fontSize: 11, fontWeight: '700' },
  dueChip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6,
  },
  dueChipText: { color: '#d97706', fontSize: 11, fontWeight: '700' },
});

export default InvoicesListScreen;
