// POSConfigSessions — the in-app equivalent of Odoo's POS → Sessions list
// scoped to a single register (pos.config). Reached from the kebab popover
// on each register card in POSRegister.
//
// Per session row shows: Session ID, Status pill, Opened By, Opening Date,
// Closing Date, Starting Balance, Ending Balance — same column set Odoo Web
// shows in the Sessions list view.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { fetchSessionsForConfig } from '@api/services/generalApi';
import { formatCurrency } from '@utils/currency';

const PAGE_SIZE = 30;

const fmtDate = (raw) => {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleString();
  } catch (_) {
    return String(raw);
  }
};

const statusPalette = (state) => {
  switch (state) {
    case 'opened':
      return { bg: '#dcfce7', fg: '#15803d', label: 'OPENED' };
    case 'opening_control':
      return { bg: '#fef3c7', fg: '#b45309', label: 'OPENING CONTROL' };
    case 'closing_control':
      return { bg: '#dbeafe', fg: '#1d4ed8', label: 'CLOSING CONTROL' };
    case 'closed':
      return { bg: '#e5e7eb', fg: '#374151', label: 'CLOSED & POSTED' };
    default:
      return { bg: '#f3f4f6', fg: '#6b7280', label: String(state || '—').toUpperCase() };
  }
};

const POSConfigSessions = ({ navigation, route }) => {
  const configId = route?.params?.configId;
  const configName = route?.params?.configName || 'Register';

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [offset, setOffset] = useState(0);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchSessionsForConfig({ configId, limit: PAGE_SIZE, offset: 0 });
      setSessions(Array.isArray(list) ? list : []);
      setOffset(Array.isArray(list) ? list.length : 0);
      setEndReached(!Array.isArray(list) || list.length < PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [configId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await fetchSessionsForConfig({ configId, limit: PAGE_SIZE, offset: 0 });
      setSessions(Array.isArray(list) ? list : []);
      setOffset(Array.isArray(list) ? list.length : 0);
      setEndReached(!Array.isArray(list) || list.length < PAGE_SIZE);
    } finally {
      setRefreshing(false);
    }
  }, [configId]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || endReached || loading || refreshing) return;
    setLoadingMore(true);
    try {
      const more = await fetchSessionsForConfig({ configId, limit: PAGE_SIZE, offset });
      const list = Array.isArray(more) ? more : [];
      if (list.length === 0) {
        setEndReached(true);
      } else {
        setSessions((prev) => [...prev, ...list]);
        setOffset(offset + list.length);
        if (list.length < PAGE_SIZE) setEndReached(true);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [configId, offset, loadingMore, endReached, loading, refreshing]);

  useFocusEffect(useCallback(() => { loadFirstPage(); }, [loadFirstPage]));

  const renderItem = ({ item }) => {
    const pal = statusPalette(item.state);
    const openedBy = Array.isArray(item.user_id) ? item.user_id[1] : '—';
    const start = Number(item.cash_register_balance_start) || 0;
    const end = Number(item.cash_register_balance_end_real) || 0;
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('MyOrdersScreen', { sessionId: item.id, configName: `${configName} • ${item.name}` })}
        activeOpacity={0.85}
        style={s.row}
      >
        <View style={s.rowTop}>
          <Text style={s.sessionName} numberOfLines={1}>{item.name || `Session #${item.id}`}</Text>
          <View style={[s.statusPill, { backgroundColor: pal.bg }]}>
            <Text style={[s.statusPillText, { color: pal.fg }]}>{pal.label}</Text>
          </View>
        </View>
        <View style={s.rowMetaGrid}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Opened by</Text>
            <Text style={s.metaValue} numberOfLines={1}>{openedBy}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Opening</Text>
            <Text style={s.metaValue}>{fmtDate(item.start_at)}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Closing</Text>
            <Text style={s.metaValue}>{fmtDate(item.stop_at)}</Text>
          </View>
        </View>
        <View style={s.balanceRow}>
          <View style={s.balanceCol}>
            <Text style={s.metaLabel}>Starting Balance</Text>
            <Text style={s.balanceValue}>{formatCurrency(start)}</Text>
          </View>
          <View style={s.balanceCol}>
            <Text style={s.metaLabel}>Ending Balance</Text>
            <Text style={s.balanceValue}>{formatCurrency(end)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <NavigationHeader
        title={`Sessions — ${configName}`}
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      {loading && sessions.length === 0 ? (
        <View style={s.loaderWrap}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={s.loaderText}>Loading sessions…</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={s.footerLoader}>
                <ActivityIndicator size="small" color="#7c3aed" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={s.emptyWrap}>
                <MaterialIcons name="history" size={40} color="#9ca3af" />
                <Text style={s.emptyText}>No sessions yet for this register.</Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 10, color: '#6b7280' },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyWrap: { paddingVertical: 80, alignItems: 'center' },
  emptyText: { marginTop: 10, color: '#6b7280', fontSize: 14 },

  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  sessionName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#111', marginRight: 8 },
  statusPill: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999,
  },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  rowMetaGrid: {
    flexDirection: 'row', gap: 12,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 10, color: '#9ca3af', letterSpacing: 0.6, fontWeight: '700', textTransform: 'uppercase' },
  metaValue: { marginTop: 2, fontSize: 12, color: '#111' },

  balanceRow: {
    flexDirection: 'row', gap: 12,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  balanceCol: { flex: 1 },
  balanceValue: { marginTop: 2, fontSize: 13, color: '#111', fontWeight: '800' },
});

export default POSConfigSessions;
