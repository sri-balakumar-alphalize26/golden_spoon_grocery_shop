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

const JournalEntriesListScreen = ({ navigation }) => {
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
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconDisk}>
            <Icon name="account-balance" size={20} color="#7B2D8E" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.number}>{item.name || '—'}</Text>
            <Text style={styles.date}>{formatDate(item.date)}</Text>
          </View>
          <Text style={styles.total}>{formatCurrency(item.amount_total, currency)}</Text>
        </View>
        {partner !== '—' ? (
          <View style={styles.detailRow}><Icon name="person" size={14} color="#6b7280" /><Text style={styles.detailText}>{partner}</Text></View>
        ) : null}
        {item.ref ? (
          <View style={styles.detailRow}><Icon name="link" size={14} color="#6b7280" /><Text style={styles.detailText}>{item.ref}</Text></View>
        ) : null}
        <View style={styles.detailRow}><Icon name="book" size={14} color="#6b7280" /><Text style={styles.detailText}>{journal}</Text></View>
        {company ? (
          <View style={styles.detailRow}><Icon name="business" size={14} color="#6b7280" /><Text style={styles.detailText}>{company}</Text></View>
        ) : null}
        <View style={[styles.badge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.badgeText, { color }]}>{stateLabel(item.state)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Journal Entries" onBackPress={() => navigation.goBack()} />
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
  card: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 6, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  iconDisk: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E5F5' },
  number: { fontSize: 14, fontWeight: '800', color: '#111827' },
  date: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  total: { fontSize: 14, fontWeight: '900', color: '#111827' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  detailText: { color: '#4b5563', fontSize: 12, flex: 1 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
});

export default JournalEntriesListScreen;
