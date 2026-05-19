// Accounting → Partner Ledger. Mirrors Odoo's Accounting → Reporting →
// Partner Ledger view: every debit/credit movement against each partner
// with a running net balance. Lines are fetched server-side ordered by
// partner_id then date desc; we group them client-side into collapsible
// partner sections.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, ActivityIndicator, RefreshControl } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { fetchPartnerLedgerOdoo } from '@api/services/generalApi';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';
import useDebouncedSearch from '@hooks/useDebouncedSearch';

const formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).includes('T') ? s : `${s}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const PartnerLedgerScreen = ({ navigation }) => {
  const currency = useAuthStore((s) => s.currency);
  const [rows, setRows] = useState([]);
  const [collapsed, setCollapsed] = useState({}); // partnerId -> bool
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE = 100;

  const load = useCallback(async ({ searchText: q = '', resetOffset = true } = {}) => {
    if (resetOffset) {
      setLoading(true);
      setOffset(0);
    }
    try {
      const list = await fetchPartnerLedgerOdoo({
        offset: resetOffset ? 0 : offset,
        limit: PAGE,
        searchText: q,
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
  }, [offset]);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => load({ searchText: text, resetOffset: true }),
    500
  );

  useEffect(() => { load({ resetOffset: true }); }, []);  // eslint-disable-line

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    load({ searchText, resetOffset: false });
  };

  // Group rows by partner_id → SectionList sections
  const sections = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const partnerKey = Array.isArray(r.partner_id) ? String(r.partner_id[0]) : 'unknown';
      const partnerName = Array.isArray(r.partner_id) ? r.partner_id[1] : 'Unknown';
      if (!map.has(partnerKey)) {
        map.set(partnerKey, { title: partnerName, key: partnerKey, data: [], debit: 0, credit: 0, balance: 0 });
      }
      const sec = map.get(partnerKey);
      sec.data.push(r);
      sec.debit += Number(r.debit) || 0;
      sec.credit += Number(r.credit) || 0;
      sec.balance += Number(r.balance) || 0;
    }
    // Default: each partner section is COLLAPSED. User taps the section
    // header to expand. `collapsed[key]` semantics:
    //   undefined / true → collapsed (data hidden)
    //   false            → expanded (data visible)
    return Array.from(map.values()).map((sec) => ({
      ...sec,
      data: collapsed[sec.key] === false ? sec.data : [],
    }));
  }, [rows, collapsed]);

  const renderItem = ({ item }) => {
    const move = Array.isArray(item.move_id) ? item.move_id[1] : '';
    const moveId = Array.isArray(item.move_id) ? item.move_id[0] : item.move_id;
    const account = Array.isArray(item.account_id) ? item.account_id[1] : '';
    const debit = Number(item.debit) || 0;
    const credit = Number(item.credit) || 0;
    const balance = Number(item.balance) || 0;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.85}
        onPress={() => {
          if (moveId) navigation.navigate('InvoiceDetailScreen', { invoiceId: moveId });
        }}
      >
        <View style={styles.rowTop}>
          <Text style={styles.rowDate}>{formatDate(item.date)}</Text>
          <Text style={styles.rowMove} numberOfLines={1}>{move}</Text>
          <Text style={[styles.rowBalance, balance < 0 && { color: '#dc2626' }]}>
            {formatCurrency(balance, currency)}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowAccount} numberOfLines={1}>{account}</Text>
          <View style={styles.rowAmts}>
            {debit > 0 ? (
              <Text style={styles.rowDebit}>{`D ${formatCurrency(debit, currency)}`}</Text>
            ) : null}
            {credit > 0 ? (
              <Text style={styles.rowCredit}>{`C ${formatCurrency(credit, currency)}`}</Text>
            ) : null}
          </View>
        </View>
        {item.name ? (
          <Text style={styles.rowLabel} numberOfLines={1}>{item.name}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }) => {
    // Collapsed unless explicitly expanded (collapsed[key] === false).
    const isCollapsed = collapsed[section.key] !== false;
    return (
      <TouchableOpacity
        style={styles.sectionHeader}
        activeOpacity={0.85}
        onPress={() => setCollapsed((c) => ({ ...c, [section.key]: c[section.key] === false }))}
      >
        <Icon name={isCollapsed ? 'chevron-right' : 'expand-more'} size={18} color="#1f2937" />
        <Text style={styles.sectionTitle} numberOfLines={1}>{section.title}</Text>
        <Text style={[styles.sectionBalance, section.balance < 0 && { color: '#dc2626' }]}>
          {formatCurrency(section.balance, currency)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Partner Ledger" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        searchText={searchText}
        onChangeText={handleSearchTextChange}
        placeholder="Search by partner, move, or account"
      />
      <RoundedContainer>
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#1E88E5" /></View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(it, i) => `pl-${it.id || i}`}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load({ searchText, resetOffset: true })} />}
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator color="#1E88E5" /></View> : null}
            ListEmptyComponent={(
              <EmptyState
                imageSource={require('@assets/images/EmptyData/empty_data.png')}
                title="No partner movements"
                description="Posted journal entries with a partner will appear here."
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
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#c7d2fe',
  },
  sectionTitle: { flex: 1, color: '#1e1b4b', fontWeight: '800', fontSize: 13 },
  sectionBalance: { color: '#1e1b4b', fontWeight: '900', fontSize: 13 },
  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowDate: { fontSize: 11, color: '#6b7280', width: 64, fontWeight: '700' },
  rowMove: { flex: 1, fontSize: 12, color: '#1f2937', fontWeight: '700' },
  rowBalance: { fontSize: 12, color: '#111827', fontWeight: '900' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rowAccount: { flex: 1, color: '#4b5563', fontSize: 11 },
  rowAmts: { flexDirection: 'row', gap: 6 },
  rowDebit: { color: '#1d4ed8', fontSize: 11, fontWeight: '800' },
  rowCredit: { color: '#16a34a', fontSize: 11, fontWeight: '800' },
  rowLabel: { color: '#6b7280', fontSize: 10, marginTop: 3, fontStyle: 'italic' },
});

export default PartnerLedgerScreen;
