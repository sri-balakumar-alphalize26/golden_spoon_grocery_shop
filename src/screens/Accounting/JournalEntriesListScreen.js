// Accounting → Journal Entries. Mirrors Odoo's Accounting → Accounting →
// Journal Entries page in the app — each row is one `account.move`.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { fetchJournalEntriesOdoo } from '@api/services/generalApi';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';
import useDebouncedSearch from '@hooks/useDebouncedSearch';

const STATE_FILTERS = [
  { key: 'posted', states: ['posted'], label: 'Posted' },
  { key: 'all',    states: [],         label: 'All' },
  { key: 'draft',  states: ['draft'],  label: 'Draft' },
  { key: 'cancel', states: ['cancel'], label: 'Cancelled' },
];

const formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).includes('T') ? s : `${s}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const stateColor = (state) => {
  switch (state) {
    case 'posted': return '#16a34a';
    case 'draft':  return '#6b7280';
    case 'cancel': return '#dc2626';
    default:       return '#6b7280';
  }
};

const stateLabel = (state) => {
  switch (state) {
    case 'posted': return 'Posted';
    case 'draft':  return 'Draft';
    case 'cancel': return 'Cancelled';
    default:       return state;
  }
};

const JournalEntriesListScreen = ({ navigation, route }) => {
  // Sub-tile from the Home → Journals popup passes a journal-type filter
  // and a label suffix ("Sales" / "Purchases" / etc.) used in the header.
  const journalTypes = route?.params?.journalTypes || null;
  const titleSuffix = route?.params?.titleSuffix || '';
  const currency = useAuthStore((s) => s.currency);
  const [stateFilter, setStateFilter] = useState('posted');
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
      const list = await fetchJournalEntriesOdoo({
        offset: resetOffset ? 0 : offset,
        limit: PAGE,
        searchText: q,
        states: activeStates,
        journalTypes,
      });
      if (resetOffset) setRows(list || []);
      else setRows((prev) => [...prev, ...(list || [])]);
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
    const journal = Array.isArray(item.journal_id) ? item.journal_id[1] : '—';
    const company = Array.isArray(item.company_id) ? item.company_id[1] : '';
    const color = stateColor(item.state);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('InvoiceDetailScreen', { invoiceId: item.id })}
      >
        {/* Header — 48x48 disk + name/badge stack + amount right (Orders look) */}
        <View style={styles.headerRow}>
          <View style={styles.iconDisk}>
            <Icon name="account-balance" size={24} color="#461c8aff" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.number}>{item.name || '—'}</Text>
            <View style={[styles.badge, { backgroundColor: color + '20' }]}>
              <Text style={[styles.badgeText, { color }]}>{stateLabel(item.state)}</Text>
            </View>
          </View>
          <Text style={styles.total}>{formatCurrency(item.amount_total, currency)}</Text>
        </View>
        {/* Bordered detail section below header */}
        <View style={styles.detailSection}>
          {partner !== '—' ? (
            <View style={styles.detailRow}><Icon name="person" size={14} color="#6b7280" /><Text style={styles.detailText}>{partner}</Text></View>
          ) : null}
          <View style={styles.detailRow}><Icon name="event" size={14} color="#6b7280" /><Text style={styles.detailText}>{formatDate(item.date)}</Text></View>
          <View style={styles.detailRow}><Icon name="book" size={14} color="#6b7280" /><Text style={styles.detailText}>{journal}</Text></View>
          {item.ref ? (
            <View style={styles.detailRow}><Icon name="link" size={14} color="#6b7280" /><Text style={styles.detailText}>{item.ref}</Text></View>
          ) : null}
          {company ? (
            <View style={styles.detailRow}><Icon name="business" size={14} color="#6b7280" /><Text style={styles.detailText}>{company}</Text></View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title={titleSuffix ? `Journal Entries — ${titleSuffix}` : 'Journal Entries'} onBackPress={() => navigation.goBack()} />
      <SearchContainer
        searchText={searchText}
        onChangeText={handleSearchTextChange}
        placeholder="Search by entry #, reference, partner"
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
          <View style={styles.loadingBox}><ActivityIndicator color="#7B2D8E" /></View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it, i) => `je-${it.id || i}`}
            renderItem={renderItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load({ searchText, resetOffset: true })} />}
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator color="#7B2D8E" /></View> : null}
            ListEmptyComponent={(
              <EmptyState
                imageSource={require('@assets/images/EmptyData/empty_data.png')}
                title="No journal entries"
                description="Posted accounting entries will appear here."
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
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  filterChipActive: { backgroundColor: '#7B2D8E', borderColor: '#7B2D8E' },
  filterText: { color: '#374151', fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  // Card matches MyOrdersScreen.renderOrderItem look: 48x48 disk on left,
  // name + status pill stacked in the middle, amount right; bordered
  // detail section below for partner / date / journal / ref / company.
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
  iconDisk: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f0ff' },
  number: { fontSize: 15, fontWeight: '700', color: '#111827' },
  total: { fontSize: 15, fontWeight: '700', color: '#111827' },
  detailSection: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  detailText: { color: '#4b5563', fontSize: 12, flex: 1 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
});

export default JournalEntriesListScreen;
