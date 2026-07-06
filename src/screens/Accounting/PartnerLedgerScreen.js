// Accounting → Partner Ledger. Mirrors Odoo's Accounting → Reporting →
// Partner Ledger: the same columns (Date · Journal Entry · Account · Label ·
// Debit · Credit · Due Date · Balance · Matching), grouped by partner with a
// per-partner subtotal row (collapsed by default) and a grand-total row at the
// end. The table scrolls horizontally so all Odoo columns fit on a phone.
//
// Lines are fetched paginated (ordered by partner_id then date desc) and grouped
// client-side; the per-partner + grand totals come from a separate read_group so
// they're accurate over the whole dataset regardless of the line pagination.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { fetchPartnerLedgerOdoo, fetchPartnerLedgerTotalsOdoo, fetchPartnerLedgerPeriodsOdoo } from '@api/services/generalApi';
import PartnerLedgerFiltersModal from '@components/Modal/PartnerLedgerFiltersModal';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';
import useDebouncedSearch from '@hooks/useDebouncedSearch';

// Column widths (px). NAME_W spans the Date+Journal+Account+Label region so the
// group/total rows can put their subtotals under the Debit/Credit/Balance cols.
const COL = { date: 64, journal: 140, account: 150, label: 120, debit: 100, credit: 100, due: 74, balance: 112, match: 78 };
const NAME_W = COL.date + COL.journal + COL.account + COL.label;
const TABLE_W = NAME_W + COL.debit + COL.credit + COL.due + COL.balance + COL.match;

const formatDate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).includes('T') ? s : `${s}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const PartnerLedgerScreen = ({ navigation }) => {
  const currency = useAuthStore((s) => s.currency);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ perPartner: {}, grand: { debit: 0, credit: 0, balance: 0 } });
  // Default to Odoo's Partner Ledger defaults: Posted + With residual (keeps the
  // Balance meaningful without hardcoding account types, and includes Outstanding
  // Receipts/Payments accounts).
  const [filters, setFilters] = useState({ posting: ['posted'], reconcile: ['with_residual'] });
  const [filterOpen, setFilterOpen] = useState(false);
  const [periods, setPeriods] = useState({ months: [], years: [] }); // used months/years for the Date filter
  const [collapsed, setCollapsed] = useState({}); // partnerId -> bool
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE = 100;

  const money = useCallback((v) => formatCurrency(Number(v) || 0, currency), [currency]);

  const load = useCallback(async ({ searchText: q = '', resetOffset = true, flt } = {}) => {
    const f = flt !== undefined ? flt : filters;
    if (resetOffset) {
      setLoading(true);
      setOffset(0);
    }
    try {
      const [list, tot, per] = await Promise.all([
        fetchPartnerLedgerOdoo({ offset: resetOffset ? 0 : offset, limit: PAGE, searchText: q, filters: f }),
        // Totals + periods cover the whole dataset, so only refetch on reset.
        resetOffset ? fetchPartnerLedgerTotalsOdoo({ searchText: q, filters: f }) : Promise.resolve(null),
        resetOffset ? fetchPartnerLedgerPeriodsOdoo({ filters: f }) : Promise.resolve(null),
      ]);
      if (resetOffset) setRows(list || []);
      else setRows((prev) => [...prev, ...(list || [])]);
      if (tot) setTotals(tot);
      if (per) setPeriods(per);
      setHasMore((list || []).length === PAGE);
      if (resetOffset) setOffset(PAGE);
      else setOffset((o) => o + PAGE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset, filters]);

  const onApplyFilters = (f) => {
    setFilters(f);
    setFilterOpen(false);
    load({ searchText, resetOffset: true, flt: f });
  };

  // Applied-filter chips shown on the page (like Odoo). Each knows how to
  // produce the filters object with just that one removed.
  const activeChips = useMemo(() => {
    const L = {
      posting: { draft: 'Unposted', posted: 'Posted' },
      reconcile: { unreconciled: 'Unreconciled', with_residual: 'With residual' },
      journal: { sale: 'Sales', purchase: 'Purchases', bank: 'Bank', cash: 'Cash', credit: 'Credit', general: 'Miscellaneous' },
      account: { payable: 'Payable', receivable: 'Receivable', pl: 'P&L Accounts' },
    };
    const chips = [];
    (filters.posting || []).forEach((k) => chips.push({ id: `posting:${k}`, label: L.posting[k] || k, next: { ...filters, posting: filters.posting.filter((x) => x !== k) } }));
    if (filters.toReview) chips.push({ id: 'toReview', label: 'To Review', next: { ...filters, toReview: false } });
    (filters.reconcile || []).forEach((k) => chips.push({ id: `reconcile:${k}`, label: L.reconcile[k] || k, next: { ...filters, reconcile: filters.reconcile.filter((x) => x !== k) } }));
    (filters.journalTypes || []).forEach((k) => chips.push({ id: `journal:${k}`, label: L.journal[k] || k, next: { ...filters, journalTypes: filters.journalTypes.filter((x) => x !== k) } }));
    (filters.accountGroups || []).forEach((k) => chips.push({ id: `account:${k}`, label: L.account[k] || k, next: { ...filters, accountGroups: filters.accountGroups.filter((x) => x !== k) } }));
    (filters.dateRanges || []).forEach((dr) => {
      const dp = { ...(filters.datePeriods || {}) };
      if (dr.pkey) delete dp[dr.pkey];
      chips.push({ id: `date:${dr.field}`, label: dr.label || 'Date', next: { ...filters, datePeriods: dp, dateRanges: filters.dateRanges.filter((x) => x !== dr) } });
    });
    return chips;
  }, [filters]);

  const activeFilterCount = useMemo(() => (
    (filters.posting?.length || 0)
    + (filters.toReview ? 1 : 0)
    + (filters.reconcile?.length || 0)
    + (filters.journalTypes?.length || 0)
    + (filters.accountGroups?.length || 0)
    + (filters.dateRanges?.length || 0)
  ), [filters]);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => load({ searchText: text, resetOffset: true }),
    500
  );

  useEffect(() => { load({ resetOffset: true }); }, []);  // eslint-disable-line

  useFocusEffect(
    useCallback(() => {
      load({ searchText, resetOffset: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchText])
  );

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    load({ searchText, resetOffset: false });
  };

  const onScroll = ({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 48) handleLoadMore();
  };

  // Group loaded lines by partner, preserving first-seen order. Numbers come
  // from `totals.perPartner` (accurate); fall back to client sums if absent.
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = Array.isArray(r.partner_id) ? String(r.partner_id[0]) : 'none';
      const name = Array.isArray(r.partner_id) ? r.partner_id[1] : 'None';
      if (!map.has(key)) map.set(key, { key, name, lines: [], debit: 0, credit: 0, balance: 0 });
      const g = map.get(key);
      g.lines.push(r);
      g.debit += Number(r.debit) || 0;
      g.credit += Number(r.credit) || 0;
      g.balance += Number(r.balance) || 0;
    }
    return Array.from(map.values()).map((g) => {
      const t = totals.perPartner[g.key];
      return {
        ...g,
        debit: t ? t.debit : g.debit,
        credit: t ? t.credit : g.credit,
        balance: t ? t.balance : g.balance,
        count: t ? t.count : g.lines.length,
      };
    });
  }, [rows, totals]);

  const Cell = ({ w, children, align = 'left', style }) => (
    <Text
      numberOfLines={1}
      style={[styles.cell, { width: w, textAlign: align }, style]}
    >
      {children}
    </Text>
  );

  const HeaderRow = () => (
    <View style={[styles.tableRow, styles.headRow]}>
      <Cell w={COL.date} style={styles.headText}>Date</Cell>
      <Cell w={COL.journal} style={styles.headText}>Journal Entry</Cell>
      <Cell w={COL.account} style={styles.headText}>Account</Cell>
      <Cell w={COL.label} style={styles.headText}>Label</Cell>
      <Cell w={COL.debit} align="right" style={styles.headText}>Debit</Cell>
      <Cell w={COL.credit} align="right" style={styles.headText}>Credit</Cell>
      <Cell w={COL.due} style={styles.headText}>Due Date</Cell>
      <Cell w={COL.balance} align="right" style={styles.headText}>Balance</Cell>
      <Cell w={COL.match} style={styles.headText}>Matching</Cell>
    </View>
  );

  const GroupRow = ({ g }) => {
    const isCollapsed = collapsed[g.key] !== false;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setCollapsed((c) => ({ ...c, [g.key]: c[g.key] === false }))}
        style={[styles.tableRow, styles.groupRow]}
      >
        <View style={[styles.groupName, { width: NAME_W }]}>
          <Icon name={isCollapsed ? 'chevron-right' : 'expand-more'} size={18} color="#1e1b4b" />
          <Text style={styles.groupTitle} numberOfLines={1}>{`${g.name} (${g.count})`}</Text>
        </View>
        <Cell w={COL.debit} align="right" style={styles.groupNum}>{money(g.debit)}</Cell>
        <Cell w={COL.credit} align="right" style={styles.groupNum}>{money(g.credit)}</Cell>
        <Cell w={COL.due}>{''}</Cell>
        <Cell w={COL.balance} align="right" style={[styles.groupNum, g.balance < 0 && styles.neg]}>{money(g.balance)}</Cell>
        <Cell w={COL.match}>{''}</Cell>
      </TouchableOpacity>
    );
  };

  const LineRow = ({ item }) => {
    const move = Array.isArray(item.move_id) ? item.move_id[1] : '';
    const moveId = Array.isArray(item.move_id) ? item.move_id[0] : item.move_id;
    const account = Array.isArray(item.account_id) ? item.account_id[1] : '';
    const bal = Number(item.balance) || 0;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { if (moveId) navigation.navigate('InvoiceDetailScreen', { invoiceId: moveId }); }}
        style={[styles.tableRow, styles.lineRow]}
      >
        <Cell w={COL.date} style={styles.lineDate}>{formatDate(item.date)}</Cell>
        <Cell w={COL.journal} style={styles.lineMove}>{move}</Cell>
        <Cell w={COL.account} style={styles.lineMuted}>{account}</Cell>
        <Cell w={COL.label} style={styles.lineMuted}>{item.name || ''}</Cell>
        <Cell w={COL.debit} align="right" style={styles.lineNum}>{money(item.debit)}</Cell>
        <Cell w={COL.credit} align="right" style={styles.lineNum}>{money(item.credit)}</Cell>
        <Cell w={COL.due} style={styles.lineDue}>{item.date_maturity ? formatDate(item.date_maturity) : ''}</Cell>
        <Cell w={COL.balance} align="right" style={[styles.lineNum, bal < 0 && styles.neg]}>{money(bal)}</Cell>
        <Cell w={COL.match} style={styles.lineMuted}>{item.matching_number || ''}</Cell>
      </TouchableOpacity>
    );
  };

  const TotalRow = () => (
    <View style={[styles.tableRow, styles.totalRow]}>
      <Cell w={NAME_W} style={styles.totalLabel}>Total</Cell>
      <Cell w={COL.debit} align="right" style={styles.totalNum}>{money(totals.grand.debit)}</Cell>
      <Cell w={COL.credit} align="right" style={styles.totalNum}>{money(totals.grand.credit)}</Cell>
      <Cell w={COL.due}>{''}</Cell>
      <Cell w={COL.balance} align="right" style={[styles.totalNum, totals.grand.balance < 0 && styles.neg]}>{money(totals.grand.balance)}</Cell>
      <Cell w={COL.match}>{''}</Cell>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader
        title={activeFilterCount ? `Partner Ledger (${activeFilterCount})` : 'Partner Ledger'}
        onBackPress={() => navigation.goBack()}
        iconOneName="filter"
        iconOnePress={() => setFilterOpen(true)}
      />
      <SearchContainer
        searchText={searchText}
        onChangeText={handleSearchTextChange}
        placeholder="Search by partner, move, or account"
      />

      {activeChips.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
        >
          {activeChips.map((c) => (
            <TouchableOpacity key={c.id} style={styles.chip} activeOpacity={0.8} onPress={() => onApplyFilters(c.next)}>
              <Text style={styles.chipText} numberOfLines={1}>{c.label}</Text>
              <Icon name="close" size={14} color="#3730a3" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <RoundedContainer>
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#1E88E5" /></View>
        ) : groups.length === 0 ? (
          <EmptyState
            imageSource={require('@assets/images/EmptyData/empty_data.png')}
            title="No partner movements"
            description="Posted journal entries with a partner will appear here."
          />
        ) : (
          <ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load({ searchText, resetOffset: true })} />}
            showsVerticalScrollIndicator
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator>
              <View style={{ width: TABLE_W }}>
                <HeaderRow />
                {groups.map((g) => (
                  <View key={g.key}>
                    <GroupRow g={g} />
                    {collapsed[g.key] === false
                      ? g.lines.map((it, i) => <LineRow key={`l-${it.id || i}`} item={it} />)
                      : null}
                  </View>
                ))}
                {loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator color="#1E88E5" /></View> : null}
                <TotalRow />
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </RoundedContainer>

      <PartnerLedgerFiltersModal
        isVisible={filterOpen}
        initialFilters={filters}
        periods={periods}
        onClose={() => setFilterOpen(false)}
        onApply={onApplyFilters}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  chipsRow: { flexGrow: 0, backgroundColor: '#fff', paddingVertical: 8 },
  chipsContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderColor: '#c7d2fe', borderWidth: 1,
    borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10,
  },
  chipText: { fontSize: 12, color: '#3730a3', fontWeight: '700', maxWidth: 160 },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  cell: { fontSize: 11, color: '#111827', paddingHorizontal: 6 },

  headRow: { backgroundColor: '#F3F4F6', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 10 },
  headText: { fontSize: 11, fontWeight: '800', color: '#374151' },

  groupRow: { backgroundColor: '#EEF2FF', borderBottomWidth: 1, borderBottomColor: '#c7d2fe', paddingVertical: 10 },
  groupName: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  groupTitle: { flex: 1, color: '#1e1b4b', fontWeight: '800', fontSize: 12 },
  groupNum: { color: '#1e1b4b', fontWeight: '800', fontSize: 11 },

  lineRow: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 9 },
  lineDate: { color: '#6b7280', fontWeight: '700' },
  lineMove: { color: '#1f2937', fontWeight: '700' },
  lineMuted: { color: '#6b7280' },
  lineDue: { color: '#d97706', fontWeight: '700' },
  lineNum: { color: '#111827', fontWeight: '700' },

  totalRow: { backgroundColor: '#F9FAFB', borderTopWidth: 2, borderTopColor: '#d1d5db', paddingVertical: 12 },
  totalLabel: { fontWeight: '900', color: '#111827', textAlign: 'right', fontSize: 12 },
  totalNum: { fontWeight: '900', color: '#111827', fontSize: 12 },

  neg: { color: '#dc2626' },
});

export default PartnerLedgerScreen;
