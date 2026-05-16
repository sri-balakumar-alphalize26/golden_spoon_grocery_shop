// QuickPurchaseReturnListScreen — vendor returns list backed by the
// `quick_purchase_return_apps` Odoo module. Each row shows the return ref,
// vendor, date, total, and state pill. Tap a row to view detail; tap the
// floating + to create a new return.

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchQuickReturns } from '@api/services/quickPurchaseReturnApi';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import { FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const STATE_STYLE = {
  draft: { bg: '#fff7ed', fg: '#b45309', label: 'DRAFT' },
  done: { bg: '#ecfdf5', fg: '#15803d', label: 'DONE' },
  cancelled: { bg: '#fee2e2', fg: '#b91c1c', label: 'CANCELLED' },
};

const fmtDate = (raw) => {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString();
  } catch (_) { return String(raw); }
};

const QuickPurchaseReturnListScreen = ({ navigation }) => {
  const currency = useAuthStore((s) => s.currency);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const rows = await fetchQuickReturns({ limit: 100 });
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error('[QuickReturnList]', e);
      showToastMessage(e?.message || 'Failed to load returns');
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const renderItem = ({ item }) => {
    const state = STATE_STYLE[item.state] || STATE_STYLE.draft;
    const vendor = Array.isArray(item.partner_id) ? item.partner_id[1] : '—';
    const sourceBill = Array.isArray(item.source_invoice_id) ? item.source_invoice_id[1] : '';
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => navigation.navigate('QuickPurchaseReturnDetail', { id: item.id })}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.refText} numberOfLines={1}>{item.name || 'New'}</Text>
            <Text style={styles.subText} numberOfLines={1}>{vendor}</Text>
          </View>
          <View style={[styles.statePill, { backgroundColor: state.bg }]}>
            <Text style={[styles.statePillText, { color: state.fg }]}>{state.label}</Text>
          </View>
        </View>
        <View style={styles.cardMeta}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>DATE</Text>
            <Text style={styles.metaValue}>{fmtDate(item.date)}</Text>
          </View>
          {sourceBill ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>SOURCE BILL</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{sourceBill}</Text>
            </View>
          ) : null}
          <View style={[styles.metaCell, { alignItems: 'flex-end' }]}>
            <Text style={styles.metaLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>{formatCurrency(Number(item.amount_total) || 0, currency)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item) => String(item.id);

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Quick Return" onBackPress={() => navigation.goBack()} />
      <View style={styles.container}>
        {loading && data.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={ORANGE} />
            <Text style={styles.loaderText}>Loading returns…</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyWrap}>
                  <MaterialIcons name="assignment-return" size={56} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>No returns yet</Text>
                  <Text style={styles.emptyText}>Tap the + button to create your first vendor return.</Text>
                </View>
              ) : null
            }
          />
        )}

        <FeatureGate featureKey="quick_purchase_return.create">
          <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('QuickPurchaseReturnForm')}
          >
            <MaterialIcons name="add" size={26} color="#fff" />
            <Text style={styles.fabText}>New Return</Text>
          </TouchableOpacity>
        </FeatureGate>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 10, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium },

  card: {
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10,
  },
  refText: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY },
  subText: { fontSize: 12, color: '#6b7280', marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  statePill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, marginLeft: 8 },
  statePillText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4 },

  cardMeta: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6',
  },
  metaCell: { flex: 1, paddingHorizontal: 2 },
  metaLabel: { fontSize: 10, color: '#9ca3af', letterSpacing: 0.6, fontFamily: FONT_FAMILY.urbanistBold },
  metaValue: { marginTop: 2, fontSize: 12, color: '#111', fontFamily: FONT_FAMILY.urbanistMedium },
  totalValue: { marginTop: 2, fontSize: 14, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },

  emptyWrap: { paddingVertical: 80, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { marginTop: 14, color: '#111', fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold },
  emptyText: { marginTop: 6, color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 19, fontFamily: FONT_FAMILY.urbanistMedium },

  fab: {
    position: 'absolute', right: 16, bottom: 24,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ORANGE, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 28,
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  fabText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginLeft: 4 },
});

export default QuickPurchaseReturnListScreen;
