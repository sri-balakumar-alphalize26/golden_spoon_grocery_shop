import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView, RefreshControl } from 'react-native';
import { NavigationHeader } from '@components/Header';
import {
  fetchSalesReportData,
  fetchTopProducts,
  fetchSalesByUser,
  fetchPOSSessions,
  fetchPaymentMethods
} from '@api/services/generalApi';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import Icon from 'react-native-vector-icons/MaterialIcons';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency as formatCurrencyUtil, formatNumber } from '@utils/currency';

const SalesReportScreen = ({ navigation }) => {
  const currency = useAuthStore((state) => state.currency);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('today'); // today, week, month, all
  const [selectedTab, setSelectedTab] = useState('overview'); // overview, products, users, sessions, payments
  const [salesData, setSalesData] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [salesByUser, setSalesByUser] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);

  const hasLoadedRef = useRef(false);

  // Calculate date range based on selected period
  const getDateRange = (period) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate, endDate;
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (period) {
      case 'today':
        startDate = new Date(today);
        break;
      case 'week':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 1);
        break;
      case 'all':
        return { startDate: null, endDate: null };
      default:
        startDate = new Date(today);
    }

    const formatDate = (date) => {
      if (!date) return null;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    };
  };

  const fetchReportData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const dateRange = getDateRange(selectedPeriod);

      // Fetch all data in parallel (Odoo 19 style - comprehensive reporting)
      const [salesResult, productsResult, usersResult, sessionsResult, paymentsResult] = await Promise.all([
        fetchSalesReportData(dateRange),
        fetchTopProducts({ ...dateRange, limit: 10 }),
        fetchSalesByUser(dateRange),
        fetchPOSSessions({ limit: 100, offset: 0, state: '' }), // Use existing function signature
        fetchPaymentMethods(dateRange),
      ]);

      setSalesData(salesResult);
      setTopProducts(productsResult);
      setSalesByUser(usersResult);
      setSessions(sessionsResult);
      setPaymentMethods(paymentsResult);
    } catch (error) {
      console.error('Error fetching sales report:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!hasLoadedRef.current) {
      fetchReportData();
      hasLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) {
      fetchReportData();
    }
  }, [selectedPeriod]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReportData(false);
  }, [selectedPeriod]);

  // Use dynamic currency from store
  const formatCurrency = (amount) => {
    return formatCurrencyUtil(amount, currency || { symbol: '$', position: 'before' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPeriodLabel = (period) => {
    switch (period) {
      case 'today': return 'Today';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      case 'all': return 'All Time';
      default: return 'Today';
    }
  };

  const renderPeriodButtons = () => (
    <View style={styles.periodContainer}>
      {['today', 'week', 'month', 'all'].map((period) => (
        <TouchableOpacity
          key={period}
          style={[
            styles.periodButton,
            selectedPeriod === period && styles.periodButtonActive
          ]}
          onPress={() => setSelectedPeriod(period)}
        >
          <Text
            style={[
              styles.periodButtonText,
              selectedPeriod === period && styles.periodButtonTextActive
            ]}
          >
            {getPeriodLabel(period)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderTabButtons = () => (
    <View style={styles.tabContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {[
          { key: 'overview', label: 'Overview', icon: 'dashboard' },
          { key: 'products', label: 'Products', icon: 'shopping-cart' },
          { key: 'payments', label: 'Payments', icon: 'payment' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabButton,
              selectedTab === tab.key && styles.tabButtonActive
            ]}
            onPress={() => setSelectedTab(tab.key)}
          >
            <Icon
              name={tab.icon}
              size={18}
              color={selectedTab === tab.key ? '#461c8aff' : '#666'}
            />
            <Text
              style={[
                styles.tabButtonText,
                selectedTab === tab.key && styles.tabButtonTextActive
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderSummaryCards = () => {
    if (!salesData || !salesData.summary) return null;

    const { totalSales, totalOrders } = salesData.summary;

    return (
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
            <Icon name="attach-money" size={28} color="#fff" />
            <Text style={styles.summaryLabel}>Total Sales</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalSales)}</Text>
          </View>
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() => navigation.navigate('OrdersAnalysis', {
              period: selectedPeriod,
              ordersData: salesData
            })}
          >
            <Icon name="receipt" size={24} color="#2196f3" />
            <Text style={styles.summaryLabelSecondary}>Orders</Text>
            <Text style={styles.summaryValueSecondary}>{formatNumber(totalOrders)}</Text>
            <Icon name="arrow-forward" size={16} color="#2196f3" style={{ marginTop: 4 }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderProductsTab = () => {
    if (!topProducts || topProducts.length === 0) {
      return (
        <View style={styles.emptySection}>
          <Icon name="shopping-cart" size={48} color="#ccc" />
          <Text style={styles.emptySectionText}>No products data</Text>
        </View>
      );
    }

    return (
      <View style={styles.listSection}>
        {topProducts.map((product, index) => (
          <View key={product.id} style={styles.listItem}>
            <View style={[styles.listItemRank, { backgroundColor: '#4caf50' }]}>
              <Text style={styles.listItemRankText}>{index + 1}</Text>
            </View>
            <View style={styles.listItemContent}>
              <Text style={styles.listItemTitle} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.listItemSubtitle}>
                Qty: {formatNumber(product.quantity)}
              </Text>
            </View>
            <Text style={styles.listItemValue}>{formatCurrency(product.revenue)}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderUsersTab = () => {
    if (!salesByUser || salesByUser.length === 0) {
      return (
        <View style={styles.emptySection}>
          <Icon name="people" size={48} color="#ccc" />
          <Text style={styles.emptySectionText}>No salesperson data</Text>
        </View>
      );
    }

    return (
      <View style={styles.listSection}>
        {salesByUser.map((user, index) => (
          <View key={user.id} style={styles.listItem}>
            <View style={[styles.listItemRank, { backgroundColor: '#461c8aff' }]}>
              <Text style={styles.listItemRankText}>{index + 1}</Text>
            </View>
            <View style={styles.listItemContent}>
              <Text style={styles.listItemTitle} numberOfLines={1}>
                {user.name}
              </Text>
              <Text style={styles.listItemSubtitle}>
                {formatNumber(user.orderCount)} orders
              </Text>
            </View>
            <Text style={styles.listItemValue}>{formatCurrency(user.totalSales)}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSessionsTab = () => {
    if (!sessions || sessions.length === 0) {
      return (
        <View style={styles.emptySection}>
          <Icon name="point-of-sale" size={48} color="#ccc" />
          <Text style={styles.emptySectionText}>No sessions data</Text>
        </View>
      );
    }

    return (
      <View style={styles.listSection}>
        {sessions.map((session) => {
          const userName = Array.isArray(session.user_id) ? session.user_id[1] : 'N/A';
          const configName = Array.isArray(session.config_id) ? session.config_id[1] : 'N/A';
          const balanceStart = session.cash_register_balance_start || 0;
          const balanceEnd = session.cash_register_balance_end_real || 0;
          const difference = session.cash_register_difference || 0;

          return (
            <View key={session.id} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionName}>{session.name}</Text>
                <View style={[
                  styles.sessionBadge,
                  { backgroundColor: session.state === 'closed' ? '#4caf50' : '#ff9800' }
                ]}>
                  <Text style={styles.sessionBadgeText}>
                    {session.state === 'closed' ? 'Closed' : 'Open'}
                  </Text>
                </View>
              </View>
              <View style={styles.sessionDetails}>
                <View style={styles.sessionDetailRow}>
                  <Icon name="person" size={14} color="#666" />
                  <Text style={styles.sessionDetailText}>{userName}</Text>
                </View>
                <View style={styles.sessionDetailRow}>
                  <Icon name="store" size={14} color="#666" />
                  <Text style={styles.sessionDetailText}>{configName}</Text>
                </View>
                <View style={styles.sessionDetailRow}>
                  <Icon name="schedule" size={14} color="#666" />
                  <Text style={styles.sessionDetailText}>{formatDateTime(session.start_at)}</Text>
                </View>
              </View>
              <View style={styles.sessionBalances}>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceLabel}>Opening</Text>
                  <Text style={styles.balanceValue}>{formatCurrency(balanceStart)}</Text>
                </View>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceLabel}>Closing</Text>
                  <Text style={styles.balanceValue}>{formatCurrency(balanceEnd)}</Text>
                </View>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceLabel}>Difference</Text>
                  <Text style={[
                    styles.balanceValue,
                    { color: difference >= 0 ? '#4caf50' : '#f44336' }
                  ]}>
                    {formatCurrency(difference)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderPaymentsTab = () => {
    if (!paymentMethods || paymentMethods.length === 0) {
      return (
        <View style={styles.emptySection}>
          <Icon name="payment" size={48} color="#ccc" />
          <Text style={styles.emptySectionText}>No payments data</Text>
        </View>
      );
    }

    const totalPayments = paymentMethods.reduce((sum, method) => sum + method.total, 0);

    return (
      <View style={styles.listSection}>
        {paymentMethods.map((method) => {
          const percentage = totalPayments > 0 ? ((method.total / totalPayments) * 100).toFixed(1) : 0;

          return (
            <View key={method.id} style={styles.paymentCard}>
              <View style={styles.paymentHeader}>
                <View style={styles.paymentIconContainer}>
                  <Icon
                    name={method.name.toLowerCase().includes('cash') ? 'money' : 'credit-card'}
                    size={24}
                    color="#461c8aff"
                  />
                </View>
                <View style={styles.paymentContent}>
                  <Text style={styles.paymentName}>{method.name}</Text>
                  <Text style={styles.paymentSubtitle}>
                    {formatNumber(method.count)} transactions
                  </Text>
                </View>
                <View style={styles.paymentAmountContainer}>
                  <Text style={styles.paymentAmount}>{formatCurrency(method.total)}</Text>
                  <Text style={styles.paymentPercentage}>{percentage}%</Text>
                </View>
              </View>
              <View style={styles.paymentBar}>
                <View
                  style={[
                    styles.paymentBarFill,
                    { width: `${percentage}%` }
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'overview':
        return (
          <>
            {renderSummaryCards()}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top 5 Products</Text>
              {renderProductsTab()}
            </View>
          </>
        );
      case 'products':
        return renderProductsTab();
      case 'payments':
        return renderPaymentsTab();
      default:
        return renderSummaryCards();
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Sales Report"
        onBackPress={() => navigation.goBack()}
      />

      <RoundedContainer>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {renderPeriodButtons()}
          {renderTabButtons()}
          <View style={{ padding: 10 }}>
            {renderTabContent()}
          </View>
          <View style={{ height: 20 }} />
        </ScrollView>
      </RoundedContainer>

      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  periodContainer: {
    flexDirection: 'row',
    padding: 10,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#461c8aff',
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  tabContainer: {
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#f5f0ff',
    borderWidth: 1,
    borderColor: '#461c8aff',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabButtonTextActive: {
    color: '#461c8aff',
  },
  summaryContainer: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  summaryCardPrimary: {
    backgroundColor: '#461c8aff',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#fff',
    marginTop: 8,
    marginBottom: 4,
    opacity: 0.9,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  summaryLabelSecondary: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
  },
  summaryValueSecondary: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2d2d2d',
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d2d2d',
    marginBottom: 12,
  },
  listSection: {
    gap: 10,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  listItemRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listItemRankText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2d2d2d',
    marginBottom: 4,
  },
  listItemSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  listItemValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#461c8aff',
  },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d2d2d',
  },
  sessionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sessionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  sessionDetails: {
    gap: 6,
    marginBottom: 12,
  },
  sessionDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionDetailText: {
    fontSize: 13,
    color: '#666',
  },
  sessionBalances: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
    gap: 12,
  },
  balanceItem: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2d2d2d',
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentContent: {
    flex: 1,
  },
  paymentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2d2d2d',
    marginBottom: 4,
  },
  paymentSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  paymentAmountContainer: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#461c8aff',
    marginBottom: 2,
  },
  paymentPercentage: {
    fontSize: 12,
    color: '#666',
  },
  paymentBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  paymentBarFill: {
    height: '100%',
    backgroundColor: '#461c8aff',
  },
  emptySection: {
    padding: 40,
    alignItems: 'center',
  },
  emptySectionText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 12,
  },
});

export default SalesReportScreen;
