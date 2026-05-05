import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { View } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
// ⬇️ CHANGE: use Odoo version instead of old backend
import { fetchProductsOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import styles from './styles';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Toast from 'react-native-toast-message';
import { useProductStore } from '@stores/product';

const ProductsScreen = ({ navigation, route }) => {
  const categoryId = route?.params?.categoryId || '';
  useEffect(() => {
    console.log('ProductsScreen: categoryId:', categoryId);
  }, [categoryId]);
  const { fromCustomerDetails } = route.params || {};

  const { addProduct, setCurrentCustomer } = useProductStore();

  // ⬇️ CHANGE: hook now uses fetchProductsOdoo
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, categoryId }),
    500
  );

  // Use ref to track if initial data has been loaded to avoid unnecessary refetches
  const hasLoadedRef = useRef(false);
  const lastParamsRef = useRef({ searchText: '', categoryId: '' });
  const hasAttemptedFetchRef = useRef(false);

  // Fetch data only when screen is focused or search/category changes
  useFocusEffect(
    useCallback(() => {
      const paramsChanged =
        lastParamsRef.current.searchText !== searchText ||
        lastParamsRef.current.categoryId !== categoryId;

      // Only fetch if params changed or first load
      if (!hasLoadedRef.current || paramsChanged) {
        hasAttemptedFetchRef.current = true;
        fetchData({ searchText, categoryId });
        hasLoadedRef.current = true;
        lastParamsRef.current = { searchText, categoryId };
      }
    }, [categoryId, searchText])
  );

  // If opened from POS, ensure cart owner is the POS guest so quick-add works
  useEffect(() => {
    if (fromCustomerDetails || route?.params?.fromPOS) {
      try { setCurrentCustomer('pos_guest'); } catch (e) { /* ignore */ }
    }
  }, [route?.params?.fromPOS, fromCustomerDetails]);

  const handleLoadMore = useCallback(() => {
    fetchMoreData({ searchText, categoryId });
  }, [searchText, categoryId, fetchMoreData]);

  // Memoize the renderItem function to prevent unnecessary re-renders
  const renderItem = useCallback(({ item }) => {
    if (item.empty) {
      return <View style={[styles.itemStyle, styles.itemInvisible]} />;
    }

    const handleQuickAdd = () => {
      try {
        const product = {
          id: item.id,
          name: item.product_name || item.name,
          price: item.price || item.list_price || 0,
          quantity: 1,
        };
        addProduct(product);
        Toast.show({ type: 'success', text1: 'Added', text2: product.name });
      } catch (e) {
        console.warn('Quick add failed', e);
      }
    };

    return (
      <ProductsList
        item={item}
        onPress={() => navigation.navigate('ProductDetail', { detail: item, fromCustomerDetails, fromPOS: route?.params?.fromPOS })}
        showQuickAdd={!!route?.params?.fromPOS}
        onQuickAdd={handleQuickAdd}
      />
    );
  }, [navigation, fromCustomerDetails, route?.params?.fromPOS, addProduct]);

  // Memoize formatted data to prevent recalculation on every render
  const formattedData = useMemo(() => formatData(data, 3), [data]);

  const renderEmptyState = useCallback(() => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_data.png')} message={''} />
  ), []);

  // Memoize keyExtractor
  const keyExtractor = useCallback((item, index) => `product-${item.id || index}`, []);

  const renderContent = () => (
    <FlashList
      data={formattedData}
      numColumns={3}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.5}
      estimatedItemSize={150}
      removeClippedSubviews={true}
      maxToRenderPerBatch={15}
      updateCellsBatchingPeriod={50}
      initialNumToRender={12}
      windowSize={5}
    />
  );

  const renderProducts = () => {
    console.log('ProductsScreen: products returned:', data.length);
    // Show nothing while loading for the first time
    if (loading && data.length === 0 && hasAttemptedFetchRef.current) {
      return null; // Don't show empty state while loading
    }
    // Show empty state only if not loading, fetch was attempted, and no data
    if (data.length === 0 && !loading && hasAttemptedFetchRef.current) {
      return renderEmptyState();
    }
    // Show content if we have data
    if (data.length > 0) {
      return renderContent();
    }
    // Initial state before any fetch
    return null;
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder="Search Products"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      <RoundedContainer>
        {renderProducts()}
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default ProductsScreen;
