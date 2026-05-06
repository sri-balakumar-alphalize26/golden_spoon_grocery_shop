import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import {
  fetchExpensesOdoo,
  submitExpenseOdoo,
  fetchCurrentEmployeeIdOdoo,
} from '@api/services/generalApi';
import Toast from 'react-native-toast-message';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

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

const ExpenseDetailScreen = ({ navigation, route }) => {
  const { expenseId } = route?.params || {};
  const authUser = useAuthStore((state) => state.user);
  const currency = useAuthStore((state) => state.currency) || { symbol: '$', position: 'before' };

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expense, setExpense] = useState(null);

  const load = async () => {
    if (!expenseId) {
      setLoading(false);
      return;
    }
    try {
      const uid = authUser?.uid || authUser?.id;
      const emp = await fetchCurrentEmployeeIdOdoo(uid);
      const all = await fetchExpensesOdoo({ employeeId: emp?.id, limit: 200 });
      const row = (all || []).find((e) => e.id === expenseId);
      setExpense(row || null);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Failed to load expense', position: 'bottom' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  const handleSubmit = async () => {
    if (!expense || expense.state !== 'draft') return;
    setSubmitting(true);
    try {
      const resp = await submitExpenseOdoo(expense.id);
      if (resp?.error) {
        Toast.show({
          type: 'error',
          text1: 'Submit failed',
          text2: resp.error.message || resp.error.data?.message || '',
          position: 'bottom',
        });
        return;
      }
      Toast.show({ type: 'success', text1: 'Expense submitted', position: 'bottom' });
      // Reload to reflect new state.
      setLoading(true);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView backgroundColor="#F5F6FA">
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Expense</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView backgroundColor="#F5F6FA">
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Expense</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: MUTED }}>Expense not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = STATE_BADGE[expense.state] || STATE_BADGE.draft;
  const paidByLabel = expense.payment_mode === 'company_account'
    ? 'Company'
    : 'Employee (to reimburse)';

  return (
    <SafeAreaView backgroundColor="#F5F6FA">
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{expense.name || 'Expense'}</Text>
        {expense.state === 'draft' ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('ExpenseForm', { expenseId: expense.id })}
            style={styles.editBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="edit" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <Text style={styles.descLabel}>DESCRIPTION</Text>
          <Text style={styles.descValue}>{expense.name || '—'}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountText}>
              {formatCurrency(expense.total_amount, currency)}
            </Text>
            <View style={[styles.statePill, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statePillText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          </View>
        </View>

        {/* Details */}
        <Text style={styles.sectionTitle}>DETAILS</Text>
        <View style={styles.card}>
          <Row icon="event" label="Date" value={formatDate(expense.date)} />
          <Row icon="category" label="Category" value={expense.category?.name || '—'} />
          <Row icon="account-balance-wallet" label="Paid By" value={paidByLabel} />
          <Row icon="person" label="Employee" value={expense.employee?.name || '—'} last={!expense.description} />
          {expense.description ? (
            <Row icon="notes" label="Notes" value={expense.description} last />
          ) : null}
        </View>

        {expense.state === 'draft' ? (
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            activeOpacity={0.85}
            disabled={submitting}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Submit to Manager</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.lockedBanner}>
            <MaterialIcons name="lock-outline" size={16} color="#92400E" />
            <Text style={styles.lockedText}>
              {expense.state === 'reported' && 'Awaiting manager approval. Editing locked.'}
              {expense.state === 'approved' && 'Approved. Awaiting reimbursement.'}
              {expense.state === 'done' && 'Reimbursed. This expense is closed.'}
              {expense.state === 'refused' && 'Refused by manager.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Row = ({ icon, label, value, last }) => (
  <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
    <View style={styles.rowIcon}>
      <MaterialIcons name={icon} size={18} color={NAVY} />
    </View>
    <View style={{ flex: 1, marginLeft: 12 }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>{value}</Text>
    </View>
  </View>
);

export default ExpenseDetailScreen;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: {
    flex: 1, textAlign: 'center',
    color: '#fff', fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4,
    paddingHorizontal: 6,
  },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  descLabel: {
    fontSize: 10,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  descValue: {
    fontSize: 18,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
    marginTop: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  amountText: {
    fontSize: 22,
    color: ORANGE,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  statePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statePillText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  sectionTitle: {
    fontSize: 11, color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginLeft: 4, marginBottom: 6,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F6',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eef0f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowLabel: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rowValue: {
    fontSize: 14,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    marginTop: 2,
    letterSpacing: 0.2,
  },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 6,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    marginTop: 6,
  },
  lockedText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontFamily: FONT_FAMILY.urbanistMedium,
    lineHeight: 16,
  },
});
