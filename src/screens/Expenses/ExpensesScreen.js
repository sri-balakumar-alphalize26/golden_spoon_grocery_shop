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

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'reported', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'done', label: 'Paid' },
  { key: 'refused', label: 'Refused' },
];

const STATE_BADGE = {
  draft: { bg: '#E0F2FE', fg: '#075985', label: 'Draft' },
  reported: { bg: '#FEF3C7', fg: '#92400E', label: 'Submitted' },
  approved: { bg: '#DCFCE7', fg: '#166534', label: 'Approved' },
  done: { bg: '#E5E7EB', fg: '#374151', label: 'Paid' },
  refused: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Refused' },
};

const formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ExpensesScreen = ({ navigation }) => {
  const authUser = useAuthStore((state) => state.user);
  const currency = useAuthStore((state) => state.currency) || { symbol: '$', position: 'before' };

  const [employee, setEmployee] = useState(null);
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState({ to_submit: 0, waiting_approval: 0, waiting_reimbursement: 0 });
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    () => loadList(employee?.id, filter),
    400
  );

  // Resolve hr.employee on mount.
  useEffect(() => {
    const uid = authUser?.uid || authUser?.id;
    if (!uid) return;
    fetchCurrentEmployeeIdOdoo(uid).then((emp) => setEmployee(emp));
  }, [authUser]);

  const loadList = useCallback(async (employeeId, currentFilter) => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const stateForFilter = currentFilter === 'all' ? null : currentFilter;
      const [rows, sums] = await Promise.all([
        fetchExpensesOdoo({ employeeId, searchText, state: stateForFilter }),
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
      if (employee?.id) loadList(employee.id, filter);
    }, [employee?.id, filter, loadList])
  );

  const renderTotalsCard = () => (
    <View style={styles.totalsCard}>
      <View style={styles.totalCol}>
        <Text style={styles.totalAmount}>
          {formatCurrency(totals.to_submit, currency)}
        </Text>
        <Text style={styles.totalLabel}>To Submit</Text>
      </View>
      <View style={styles.totalDivider}>
        <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
      </View>
      <View style={styles.totalCol}>
        <Text style={styles.totalAmount}>
          {formatCurrency(totals.waiting_approval, currency)}
        </Text>
        <Text style={styles.totalLabel}>Waiting Approval</Text>
      </View>
      <View style={styles.totalDivider}>
        <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
      </View>
      <View style={styles.totalCol}>
        <Text style={styles.totalAmount}>
          {formatCurrency(totals.waiting_reimbursement, currency)}
        </Text>
        <Text style={styles.totalLabel}>Waiting Reimbursement</Text>
      </View>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.85}
              onPress={() => setFilter(f.key)}
              style={[styles.filterPill, active && { backgroundColor: NAVY, borderColor: NAVY }]}
            >
              <Text style={[styles.filterPillText, active && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderItem = useCallback(({ item }) => {
    const badge = STATE_BADGE[item.state] || STATE_BADGE.draft;
    const initial = (item.employee?.name || '?').trim().charAt(0).toUpperCase() || '?';
    const paidByLabel = item.payment_mode === 'company_account'
      ? 'Company'
      : 'Employee (to reimburse)';
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
          <Text style={styles.rowSub} numberOfLines={1}>{paidByLabel}</Text>
        </View>
        <View style={styles.rightCol}>
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
    if ((!data || data.length === 0) && !loading) {
      return (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty_data.png')}
          message="No expenses yet"
        />
      );
    }
    return (
      <FlashList
        data={data}
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
        {!employee && !loading ? (
          <View style={styles.noEmployeeBanner}>
            <MaterialIcons name="info-outline" size={16} color="#92400E" />
            <Text style={styles.noEmployeeText}>
              Your user isn't linked to an employee yet — ask your admin to link an HR Employee record before filing expenses.
            </Text>
          </View>
        ) : null}
        {employee ? (
          <FABButton onPress={() => navigation.navigate('ExpenseForm')} />
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
  totalCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
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
    height: 48,
    paddingTop: 6,
    paddingBottom: 6,
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
