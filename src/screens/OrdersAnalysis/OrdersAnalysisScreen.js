import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { BarChart } from 'react-native-chart-kit';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency as formatCurrencyUtil } from '@utils/currency';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const OrdersAnalysisScreen = ({ navigation, route }) => {
  const currency = useAuthStore((state) => state.currency);
  const { period = 'today', ordersData } = route?.params || {};

  const formatCurrency = (amount) => {
    return formatCurrencyUtil(amount, currency || { symbol: '$', position: 'before' });
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'today': return 'Today';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      case 'all': return 'All Time';
      default: return 'Today';
    }
  };

  const getChartData = () => {
    if (!ordersData || !ordersData.orders || ordersData.orders.length === 0) {
      return {
        labels: ['No Data'],
        datasets: [{ data: [0] }]
      };
    }

    // Group orders by date
    const groupedByDate = {};
    ordersData.orders.forEach(order => {
      if (order.state === 'cancel') return;

      const date = order.date_order
        ? new Date(order.date_order).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'Unknown';

      if (!groupedByDate[date]) {
        groupedByDate[date] = 0;
      }
      groupedByDate[date] += order.amount_total || 0;
    });

    const labels = Object.keys(groupedByDate).slice(-7);
    const data = labels.map(label => groupedByDate[label]);

    return {
      labels: labels.length > 0 ? labels : ['No Data'],
      datasets: [{ data: data.length > 0 ? data : [0] }]
    };
  };

  const getStatusColor = (state) => {
    switch (state) {
      case 'paid': return '#4caf50';
      case 'done': return '#8bc34a';
      case 'invoiced': return '#2196f3';
      case 'cancel': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getStatusLabel = (state) => {
    switch (state) {
      case 'paid': return 'Paid';
      case 'done': return 'Posted';
      case 'invoiced': return 'Invoiced';
      case 'cancel': return 'Cancelled';
      default: return 'New';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title="Orders Analysis" onBackPress={() => navigation.goBack()} />

      <ScrollView style={styles.scrollView}>
        {/* Period Badge */}
        <View style={styles.periodBadge}>
          <Icon name="access-time" size={18} color="#461c8aff" />
          <Text style={styles.periodText}>{getPeriodLabel()}</Text>
        </View>

        {/* Summary Cards */}
        {ordersData && ordersData.summary && (
          <View style={styles.summaryCards}>
            <View style={styles.summaryCard}>
              <Icon name="attach-money" size={32} color="#4caf50" />
              <Text style={styles.summaryLabel}>Total Sales</Text>
              <Text style={styles.summaryValue}>{formatCurrency(ordersData.summary.totalSales)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Icon name="receipt" size={32} color="#2196f3" />
              <Text style={styles.summaryLabel}>Orders</Text>
              <Text style={styles.summaryValue}>{ordersData.summary.totalOrders}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Icon name="trending-up" size={32} color="#ff9800" />
              <Text style={styles.summaryLabel}>Average</Text>
              <Text style={styles.summaryValue}>{formatCurrency(ordersData.summary.averageOrder)}</Text>
            </View>
          </View>
        )}

        {/* Bar Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Sales by Date</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={getChartData()}
              width={SCREEN_WIDTH - 32}
              height={280}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={{
                backgroundColor: '#ffffff',
                backgroundGradientFrom: '#ffffff',
                backgroundGradientTo: '#ffffff',
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(70, 28, 138, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                style: { borderRadius: 16 },
                propsForLabels: { fontSize: 11 },
              }}
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
            />
          </View>
        </View>

        {/* Orders List */}
        <View style={styles.ordersSection}>
          <Text style={styles.sectionTitle}>Order Details</Text>
          {ordersData && ordersData.orders && ordersData.orders.length > 0 ? (
            ordersData.orders
              .filter(o => o.state !== 'cancel')
              .slice(0, 50)
              .map((order, index) => {
                const partnerName = Array.isArray(order.partner_id)
                  ? order.partner_id[1]
                  : order.partner_id || 'Walk-in Customer';

                return (
                  <View key={order.id || index} style={styles.orderCard}>
                    <View style={styles.orderLeft}>
                      <Text style={styles.orderName}>{order.name || '/'}</Text>
                      <Text style={styles.orderCustomer}>{partnerName}</Text>
                      <Text style={styles.orderDate}>
                        {order.date_order
                          ? new Date(order.date_order).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'N/A'
                        }
                      </Text>
                    </View>
                    <View style={styles.orderRight}>
                      <Text style={styles.orderAmount}>
                        {formatCurrency(order.amount_total || 0)}
                      </Text>
                      <View style={[styles.orderStatus, { backgroundColor: getStatusColor(order.state) }]}>
                        <Text style={styles.orderStatusText}>{getStatusLabel(order.state)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
          ) : (
            <View style={styles.emptyState}>
              <Icon name="receipt" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },

  // Period Badge
  periodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  periodText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#461c8aff',
    marginLeft: 8,
  },

  // Summary Cards
  summaryCards: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 4,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginTop: 4,
  },

  // Chart Section
  chartSection: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    borderRadius: 16,
  },

  // Orders List
  ordersSection: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  orderCard: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderLeft: {
    flex: 1,
  },
  orderName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  orderCustomer: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  orderDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  orderRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  orderAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#461c8aff',
  },
  orderStatus: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  orderStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },

  // Empty State
  emptyState: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
});

export default OrdersAnalysisScreen;
