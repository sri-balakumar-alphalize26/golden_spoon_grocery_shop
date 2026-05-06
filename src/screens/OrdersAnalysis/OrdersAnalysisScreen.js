import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency as formatCurrencyUtil, formatNumber } from '@utils/currency';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 24 - 28; // page padding 12 each side + card padding 14 each side

const STATE_META = {
  paid: { label: 'Paid', color: '#22C55E', bg: '#DCFCE7', fg: '#166534' },
  done: { label: 'Posted', color: '#16A34A', bg: '#DCFCE7', fg: '#166534' },
  invoiced: { label: 'Invoiced', color: '#3B82F6', bg: '#DBEAFE', fg: '#1E40AF' },
  cancel: { label: 'Cancelled', color: '#EF4444', bg: '#FEE2E2', fg: '#B91C1C' },
  draft: { label: 'New', color: '#9CA3AF', bg: '#F3F4F6', fg: '#374151' },
};
const stateMeta = (s) => STATE_META[s] || STATE_META.draft;

const OrdersAnalysisScreen = ({ navigation, route }) => {
  const currency = useAuthStore((state) => state.currency);
  const { period = 'today', ordersData } = route?.params || {};

  const fmtMoney = (amount) => formatCurrencyUtil(amount, currency || { symbol: '$', position: 'before' });

  const periodLabel = (() => {
    switch (period) {
      case 'today': return 'Today';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      case 'all': return 'All Time';
      case 'custom': return 'Custom Range';
      default: return 'Today';
    }
  })();

  const summary = ordersData?.summary || {};
  const orders = ordersData?.orders || [];

  // Group revenue by date for the bar chart (last 7 buckets).
  const chartData = useMemo(() => {
    if (!orders || orders.length === 0) {
      return { labels: ['—'], datasets: [{ data: [0] }] };
    }
    const buckets = {};
    orders.forEach((o) => {
      if (o.state === 'cancel') return;
      const key = o.date_order
        ? new Date(o.date_order).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'Unknown';
      buckets[key] = (buckets[key] || 0) + (Number(o.amount_total) || 0);
    });
    const labels = Object.keys(buckets).slice(-7);
    const data = labels.map((k) => buckets[k]);
    return {
      labels: labels.length ? labels : ['—'],
      datasets: [{ data: data.length ? data : [0] }],
    };
  }, [orders]);

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const s = o.state || 'draft';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([state, count]) => ({ state, count }));
  }, [orders]);

  return (
    <SafeAreaView>
      <NavigationHeader title="Orders Analysis" onBackPress={() => navigation.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
      >
        {/* Hero */}
        <View style={s.heroCard}>
          <View style={s.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>TOTAL SALES</Text>
              <Text style={s.heroAmount}>{fmtMoney(summary.totalSales || 0)}</Text>
              <Text style={s.heroSub}>{periodLabel}</Text>
            </View>
            <View style={s.heroDisk}>
              <MaterialCommunityIcons name="finance" size={24} color={ORANGE} />
            </View>
          </View>
          <View style={s.heroStatsRow}>
            <View style={s.heroStat}>
              <View style={s.heroStatIconWrap}>
                <MaterialIcons name="receipt-long" size={16} color={NAVY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroStatValue}>{formatNumber(summary.totalOrders || 0)}</Text>
                <Text style={s.heroStatLabel}>Orders</Text>
              </View>
            </View>
            <View style={s.heroStat}>
              <View style={s.heroStatIconWrap}>
                <MaterialIcons name="trending-up" size={16} color={NAVY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroStatValue}>{fmtMoney(summary.averageOrder || 0)}</Text>
                <Text style={s.heroStatLabel}>Avg Order</Text>
              </View>
            </View>
            <View style={s.heroStat}>
              <View style={s.heroStatIconWrap}>
                <MaterialIcons name="account-balance" size={16} color={NAVY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroStatValue}>{fmtMoney(summary.totalTax || 0)}</Text>
                <Text style={s.heroStatLabel}>Tax</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Status breakdown */}
        {statusBreakdown.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>STATUS BREAKDOWN</Text>
            <View style={s.statusCard}>
              {statusBreakdown.map(({ state, count }, idx) => {
                const meta = stateMeta(state);
                return (
                  <View
                    key={state}
                    style={[s.statusRow, idx === statusBreakdown.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={[s.statusDot, { backgroundColor: meta.color }]} />
                    <Text style={s.statusLabel}>{meta.label}</Text>
                    <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
                      <Text style={[s.statusPillText, { color: meta.fg }]}>{formatNumber(count)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Sales by date — bar chart */}
        <Text style={s.sectionTitle}>SALES BY DATE</Text>
        <View style={s.chartCard}>
          <BarChart
            data={chartData}
            width={CHART_WIDTH}
            height={240}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(46, 41, 78, ${opacity})`,
              labelColor: () => '#1a1a2e',
              barPercentage: 0.6,
              propsForLabels: { fontSize: 10 },
            }}
            style={s.chart}
            showValuesOnTopOfBars
            fromZero
          />
        </View>

        {/* Orders list */}
        <Text style={s.sectionTitle}>ORDER DETAILS</Text>
        <View style={s.ordersCard}>
          {orders && orders.length > 0 ? (
            orders
              .filter((o) => o.state !== 'cancel')
              .slice(0, 50)
              .map((order, index, arr) => {
                const partner = Array.isArray(order.partner_id)
                  ? order.partner_id[1]
                  : order.partner_id || 'Walk-in customer';
                const meta = stateMeta(order.state);
                const dateText = order.date_order
                  ? new Date(order.date_order).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                  : '—';
                return (
                  <View
                    key={order.id || index}
                    style={[s.orderRow, index === arr.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={s.orderIconBox}>
                      <MaterialIcons name="receipt" size={18} color={NAVY} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.orderName} numberOfLines={1}>{order.name || '/'}</Text>
                      <Text style={s.orderMeta} numberOfLines={1}>{partner}</Text>
                      <Text style={s.orderDate}>{dateText}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.orderAmount}>{fmtMoney(order.amount_total || 0)}</Text>
                      <View style={[s.orderStatusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[s.orderStatusText, { color: meta.fg }]}>{meta.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
          ) : (
            <View style={s.emptyBox}>
              <MaterialIcons name="receipt" size={36} color="#cbd5e1" />
              <Text style={s.emptyText}>No orders for this period</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrdersAnalysisScreen;

const cardShadow = Platform.select({
  ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 2 },
});

const s = StyleSheet.create({
  // Hero
  heroCard: {
    backgroundColor: NAVY,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    ...cardShadow,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  heroAmount: {
    fontSize: 30,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  heroDisk: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroStatsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroStat: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 8,
    gap: 6,
  },
  heroStatIconWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  heroStatValue: { fontSize: 13, color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },
  heroStatLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.6)',
    fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 1,
  },

  // Section title
  sectionTitle: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginLeft: 4,
    marginBottom: 6,
  },

  // Status breakdown
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
    ...cardShadow,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F6',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  statusLabel: {
    flex: 1,
    fontSize: 13,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  // Chart
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
    ...cardShadow,
  },
  chart: { borderRadius: 12 },

  // Orders list
  ordersCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
    ...cardShadow,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F6',
  },
  orderIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#eef0f5',
    alignItems: 'center', justifyContent: 'center',
  },
  orderName: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  orderMeta: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  orderDate: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },
  orderAmount: {
    fontSize: 14,
    color: ORANGE,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  orderStatusPill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  orderStatusText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  // Empty
  emptyBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 8,
  },
});
