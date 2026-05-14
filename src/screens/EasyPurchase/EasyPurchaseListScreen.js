import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchEasyPurchases } from '@api/services/easyPurchaseApi';
import { showToastMessage } from '@components/Toast';
import { FeatureGate } from '@components/FeatureGate';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const STATE_STYLE = {
  draft: { bg: '#fff7ed', fg: '#b45309', label: 'DRAFT' },
  done: { bg: '#ecfdf5', fg: '#15803d', label: 'DONE' },
  cancelled: { bg: '#fee2e2', fg: '#b91c1c', label: 'CANCELLED' },
};

const PAY_STATE_STYLE = {
  paid: { bg: '#ecfdf5', fg: '#15803d', label: 'Paid' },
  invoiced: { bg: '#eff6ff', fg: '#1d4ed8', label: 'On Credit' },
  not_paid: { bg: '#fff1e6', fg: '#b45309', label: 'Unpaid' },
};

const EasyPurchaseListScreen = ({ navigation }) => {
  const currency = useAuthStore((s) => s.currency);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchEasyPurchases({ limit: 100 });
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error('[EasyPurchaseList]', e);
      showToastMessage(e?.message || 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }) => {
    const state = STATE_STYLE[item.state] || STATE_STYLE.draft;
    const pay = PAY_STATE_STYLE[item.payment_state] || PAY_STATE_STYLE.not_paid;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => navigation.navigate('EasyPurchaseDetail', { id: item.id })}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.refText}>{item.name || 'New'}</Text>
            <Text style={styles.metaText}>
              {item.partner_id?.[1] || 'No vendor'}  •  {item.date || '—'}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: state.bg }]}>
            <Text style={[styles.statusText, { color: state.fg }]}>{state.label}</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={[styles.payChip, { backgroundColor: pay.bg }]}>
            <Text style={[styles.payChipText, { color: pay.fg }]}>{pay.label}</Text>
          </View>
          <Text style={styles.totalText}>{formatCurrency(Number(item.amount_total || 0), currency)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Easy Purchase" onBackPress={() => navigation.goBack()} />
      <View style={styles.container}>
        {loading && data.length === 0 ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={ORANGE} />
            <Text style={styles.emptyText}>Loading purchases…</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(it) => `ep-${it.id}`}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
            ListEmptyComponent={(
              <View style={styles.empty}>
                <MaterialIcons name="receipt-long" size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>No purchase entries yet</Text>
                <Text style={styles.emptySub}>Tap the + button to create one</Text>
              </View>
            )}
            refreshing={loading}
            onRefresh={load}
          />
        )}

        <FeatureGate featureKey="easy_purchase.create">
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.fab}
            onPress={() => navigation.navigate('EasyPurchaseForm')}
          >
            <MaterialIcons name="add" size={26} color="#fff" />
            <Text style={styles.fabText}>New Purchase</Text>
          </TouchableOpacity>
        </FeatureGate>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  refText: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY },
  metaText: { fontSize: 12, color: '#6b7280', marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4 },
  cardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6',
  },
  payChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  payChipText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  totalText: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { marginTop: 12, fontSize: 14, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold },
  emptySub: { fontSize: 12, color: '#9ca3af', marginTop: 4, fontFamily: FONT_FAMILY.urbanistMedium },
  fab: {
    position: 'absolute', right: 16, bottom: 24,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ORANGE, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 28,
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  fabText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginLeft: 4 },
});

export default EasyPurchaseListScreen;
