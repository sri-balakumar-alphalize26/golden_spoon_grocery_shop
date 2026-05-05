import React, { useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { fetchOrdersOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Icon from 'react-native-vector-icons/MaterialIcons';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';

const MyOrdersScreen = ({ navigation }) => {
  const currency = useAuthStore((state) => state.currency);
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchOrdersOdoo);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  const hasLoadedRef = useRef(false);
  const lastParamsRef = useRef({ searchText: '' });
  const hasAttemptedFetchRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const paramsChanged = lastParamsRef.current.searchText !== searchText;

      if (!hasLoadedRef.current || paramsChanged) {
        hasAttemptedFetchRef.current = true;
        fetchData({ searchText });
        hasLoadedRef.current = true;
        lastParamsRef.current = { searchText };
      }
    }, [searchText])
  );

  const handleLoadMore = useCallback(() => {
    fetchMoreData({ searchText });
  }, [searchText, fetchMoreData]);

  const getStatusColor = (state) => {
    switch (state) {
      case 'draft':
        return '#9e9e9e';
      case 'paid':
        return '#4caf50';
      case 'done':
        return '#8bc34a';
      case 'invoiced':
        return '#2196f3';
      case 'cancel':
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  };

  const getStatusLabel = (state) => {
    switch (state) {
      case 'draft':
        return 'New';
      case 'paid':
        return 'Paid';
      case 'done':
        return 'Posted';
      case 'invoiced':
        return 'Invoiced';
      case 'cancel':
        return 'Cancelled';
      default:
        return state;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderOrderItem = useCallback(({ item }) => {
    const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : item.partner_id || 'N/A';
    const userName = Array.isArray(item.user_id) ? item.user_id[1] : item.user_id || 'N/A';

    return (
      <TouchableOpacity style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View style={styles.orderIconContainer}>
            <Icon name="receipt" size={24} color="#461c8aff" />
          </View>
          <View style={styles.orderHeaderInfo}>
            <Text style={styles.orderName}>{item.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.state) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(item.state) }]}>
                {getStatusLabel(item.state)}
              </Text>
            </View>
          </View>
          <Text style={styles.orderAmount}>{formatCurrency(item.amount_total, currency || { symbol: '$', position: 'before' })}</Text>
        </View>

        <View style={styles.orderDetails}>
          <View style={styles.detailRow}>
            <Icon name="person" size={16} color="#666" />
            <Text style={styles.detailText}>{partnerName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="person-outline" size={16} color="#666" />
            <Text style={styles.detailText}>Salesperson: {userName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="event" size={16} color="#666" />
            <Text style={styles.detailText}>{formatDate(item.date_order)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, []);

  const keyExtractor = useCallback((item, index) => `order-${item.id || index}`, []);

  const renderEmptyState = useCallback(() => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty_data.png')}
      message="No orders found"
    />
  ), []);

  const renderOrders = () => {
    if (loading && data.length === 0 && hasAttemptedFetchRef.current) {
      return null;
    }
    if (data.length === 0 && !loading && hasAttemptedFetchRef.current) {
      return renderEmptyState();
    }
    if (data.length > 0) {
      return (
        <FlashList
          data={data}
          renderItem={renderOrderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
          onEndReached={handleLoadMore}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          estimatedItemSize={150}
          removeClippedSubviews={true}
        />
      );
    }
    return null;
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Orders"
        onBackPress={() => navigation.goBack()}
      />
      <SearchContainer
        placeholder="Search Orders"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      <RoundedContainer>
        {renderOrders()}
      </RoundedContainer>

      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  orderCard: {
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
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  orderHeaderInfo: {
    flex: 1,
  },
  orderName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d2d2d',
    marginBottom: 6,
  },
  orderAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#461c8aff',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
});

export default MyOrdersScreen;
