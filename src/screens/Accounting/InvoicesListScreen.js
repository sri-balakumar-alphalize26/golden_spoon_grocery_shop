// Accounting → Invoices list. Mirrors Odoo's Accounting → Customers →
// Invoices page in the app — each row is one `account.move` (move_type in
// out_invoice / out_refund). Reuses the same visual language as
// MyOrdersScreen for consistency.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { fetchCustomerInvoicesOdoo } from '@api/services/generalApi';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';
import useDebouncedSearch from '@hooks/useDebouncedSearch';

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

  const activeStates = (STATE_FILTERS.find((f) => f.key === stateFilter)?.states) || [];

  const load = useCallback(async ({ searchText: q = '', resetOffset = true } = {}) => {
    if (resetOffset) {
      setLoading(true);
      setOffset(0);
    }
    try {
      const list = await fetchCustomerInvoicesOdoo({
        offset: resetOffset ? 0 : offset,
        limit: PAGE,
        searchText: q,
        states: activeStates,
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
  }, [activeStates, offset]);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => load({ searchText: text, resetOffset: true }),
    500
  );

  useEffect(() => {
    load({ searchText, resetOffset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter]);

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
      <View style={styles.card}>
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
        <View style={styles.detailRow}>
          <Icon name="person" size={14} color="#6b7280" />
          <Text style={styles.detailText}>{partner}</Text>
        </View>
        <View style={styles.detailRow}>
          <Icon name="event" size={14} color="#6b7280" />
          <Text style={styles.detailText}>{formatDate(item.invoice_date)}</Text>
        </View>
        {tax > 0 ? (
          <View style={styles.taxChip}>
            <Icon name="receipt-long" size={12} color="#1E88E5" />
            <Text style={styles.taxChipText}>
              {`Tax ${formatCurrency(tax, currency)}`}
            </Text>
          </View>
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
      <View style={styles.filterRow}>
        {STATE_FILTERS.map((f) => {
          const active = stateFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setStateFilter(f.key)}
              activeOpacity={0.85}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <RoundedContainer>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#1E88E5" />
          </View>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
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

  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconDisk: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  number: { fontSize: 14, fontWeight: '800', color: '#111827' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  total: { fontSize: 14, fontWeight: '900', color: '#111827' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
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
