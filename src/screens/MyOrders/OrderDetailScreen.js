import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchPosOrderDetailOdoo } from '@api/services/generalApi';
import { formatCurrency } from '@utils/currency';
import useAuthStore from '@stores/auth/useAuthStore';
import Toast from 'react-native-toast-message';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const SOFT_GREEN_BG = '#DCFCE7';
const SOFT_GREEN_FG = '#166534';
const MUTED = '#8896ab';

const stateBadge = (state) => {
  switch (state) {
    case 'draft': return { bg: '#F3F4F6', fg: '#6B7280', label: 'New' };
    case 'paid': return { bg: SOFT_GREEN_BG, fg: SOFT_GREEN_FG, label: 'Paid' };
    case 'done': return { bg: '#DBEAFE', fg: '#1E40AF', label: 'Posted' };
    case 'invoiced': return { bg: '#DBEAFE', fg: '#1E40AF', label: 'Invoiced' };
    case 'cancel': return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Cancelled' };
    default: return { bg: '#F3F4F6', fg: '#6B7280', label: state || '—' };
  }
};

const formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const OrderDetailScreen = ({ navigation, route }) => {
  const { orderId } = route?.params || {};
  const currency = useAuthStore((state) => state.currency) || { symbol: '$', position: 'before' };
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!orderId) {
      setLoading(false);
      return;
    }
    fetchPosOrderDetailOdoo(orderId)
      .then((res) => {
        if (!alive) return;
        if (res?.error) {
          Toast.show({ type: 'error', text1: 'Failed to load order', position: 'bottom' });
          return;
        }
        setOrder(res);
      })
      .catch(() => {
        Toast.show({ type: 'error', text1: 'Failed to load order', position: 'bottom' });
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [orderId]);

  if (loading) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={s.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Order</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.center}>
          <Text style={{ color: MUTED }}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = stateBadge(order.state);

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>Order {order.name}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: '#F5F6FA' }}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View style={[s.successDisk, { backgroundColor: badge.bg }]}>
              <MaterialIcons name="check-circle" size={26} color={badge.fg} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.orderName}>{order.name || '—'}</Text>
              {order.pos_reference ? (
                <Text style={s.receiptText}>Receipt {order.pos_reference}</Text>
              ) : null}
            </View>
            <View style={[s.statusPill, { backgroundColor: badge.bg }]}>
              <Text style={[s.statusText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          </View>

          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>DATE</Text>
              <Text style={s.metaValue}>{formatDate(order.date_order)}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>CUSTOMER</Text>
              <Text style={s.metaValue} numberOfLines={1}>{order.partner?.name || '—'}</Text>
            </View>
          </View>
          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>SALESPERSON</Text>
              <Text style={s.metaValue} numberOfLines={1}>{order.user?.name || '—'}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>REGISTER</Text>
              <Text style={s.metaValue} numberOfLines={1}>{order.config?.name || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Lines */}
        <Text style={s.sectionTitle}>ITEMS</Text>
        <View style={s.linesCard}>
          {order.lines.length === 0 ? (
            <Text style={[s.metaValue, { color: MUTED, textAlign: 'center', paddingVertical: 14 }]}>
              No items on this order
            </Text>
          ) : (
            order.lines.map((line, idx) => (
              <View
                key={String(line.id)}
                style={[s.lineRow, idx === order.lines.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={s.lineThumbWrap}>
                  {line.image_url ? (
                    <Image
                      source={{ uri: line.image_url }}
                      style={s.lineThumb}
                    />
                  ) : (
                    <View style={[s.lineThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef0f5' }]}>
                      <MaterialIcons name="inventory-2" size={20} color={MUTED} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.lineName} numberOfLines={2}>{line.name}</Text>
                  <Text style={s.lineMeta}>
                    {line.qty} × {formatCurrency(line.price_unit, currency)}
                    {line.discount > 0 ? `  •  −${line.discount}%` : ''}
                  </Text>
                </View>
                <Text style={s.lineSubtotal}>{formatCurrency(line.price_subtotal_incl || line.price_subtotal, currency)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        <View style={s.totalsCard}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Tax</Text>
            <Text style={s.totalValue}>{formatCurrency(order.amount_tax, currency)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Paid</Text>
            <Text style={s.totalValue}>{formatCurrency(order.amount_paid, currency)}</Text>
          </View>
          {order.amount_return > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Change</Text>
              <Text style={s.totalValue}>{formatCurrency(order.amount_return, currency)}</Text>
            </View>
          ) : null}
          <View style={s.divider} />
          <View style={s.totalRow}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandValue}>{formatCurrency(order.amount_total, currency)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrderDetailScreen;

const s = StyleSheet.create({
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
  topTitle: {
    flex: 1, textAlign: 'center',
    color: '#fff', fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  successDisk: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  orderName: { fontSize: 17, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.2 },
  receiptText: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.3 },

  metaRow: { flexDirection: 'row', marginTop: 8, gap: 12 },
  metaCell: { flex: 1 },
  metaLabel: {
    fontSize: 10, color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: 13, color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    marginTop: 2, letterSpacing: 0.2,
  },

  sectionTitle: {
    fontSize: 11, color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginLeft: 4, marginBottom: 6,
  },

  linesCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 4,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F2F6',
  },
  lineThumbWrap: { width: 44, height: 44 },
  lineThumb: { width: 44, height: 44, borderRadius: 8 },
  lineName: { fontSize: 13, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold },
  lineMeta: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  lineSubtotal: {
    fontSize: 13, color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginLeft: 8,
  },

  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: MUTED, fontFamily: FONT_FAMILY.urbanistMedium },
  totalValue: { fontSize: 13, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold },
  divider: { height: 1, backgroundColor: '#F1F2F6', marginVertical: 8 },
  grandLabel: { fontSize: 15, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  grandValue: { fontSize: 17, color: ORANGE, fontFamily: FONT_FAMILY.urbanistBold },
});
