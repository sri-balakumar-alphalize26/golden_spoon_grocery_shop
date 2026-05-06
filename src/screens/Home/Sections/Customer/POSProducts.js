import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import { fetchProductsOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import productsStyles from '@screens/Products/styles';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import { useProductStore } from '@stores/product';
import Toast from 'react-native-toast-message';

const POSProducts = ({ navigation }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);
  const { addProduct, setCurrentCustomer } = useProductStore();

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  const hasLoadedRef = useRef(false);
  const lastSearchRef = useRef('');
  const hasAttemptedFetchRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      try { setCurrentCustomer('pos_guest'); } catch (_) {}

      const searchChanged = lastSearchRef.current !== searchText;
      if (!hasLoadedRef.current || searchChanged) {
        hasAttemptedFetchRef.current = true;
        fetchData({ searchText });
        hasLoadedRef.current = true;
        lastSearchRef.current = searchText;
      }
    }, [searchText])
  );

  useEffect(() => {
    if (data && data.length > 0) {
      console.log('[POSProducts] Fetched products count:', data.length);
    }
  }, [data]);

  const mapToStoreProduct = (p) => ({
    id: `prod_${p.id}`,
    remoteId: p.id,
    name: p.name || p.product_name || p.display_name || 'Product',
    price: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
    price_unit: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
    quantity: 1,
    qty: 1,
    image_url: p.image_url || p.image_1920 || null,
    product_code: p.default_code || p.product_code || p.code || null,
    category: {
      category_name:
        p.categ_id && Array.isArray(p.categ_id) ? p.categ_id[1] : p.category_name || '',
    },
  });

  // Quick-add (+) button: add to cart if new, show "Already Added" toast if duplicate.
  // Mirrors the employee_attendance POSProducts behaviour — the user adjusts
  // quantity from the register screen, not by tapping `+` again.
  const handleQuickAdd = useCallback((item) => {
    try {
      const cartId = `prod_${item.id}`;
      const { getCurrentCart } = useProductStore.getState();
      const cart = getCurrentCart() || [];
      const existing = cart.find((c) => String(c.id) === cartId);
      if (existing) {
        const productName = item?.product_name || item?.name || 'Product';
        Toast.show({
          type: 'info',
          text1: 'Already Added',
          text2: `${productName} is already in the cart. Go back and increase quantity.`,
        });
        return;
      }
      const prod = mapToStoreProduct(item);
      addProduct(prod);
      Toast.show({
        type: 'success',
        text1: 'Added',
        text2: prod.name,
      });
    } catch (e) {
      console.warn('[POSProducts] Quick add failed', e);
    }
  }, [addProduct]);

  // Card tap → open ProductDetail page (matches the front-Home Products flow).
  // Adding to cart only happens via the orange `+` quick-add button.
  const handleCardPress = useCallback((item) => {
    navigation.navigate('ProductDetail', {
      detail: item,
      fromPOS: true,
    });
  }, [navigation]);

  const handleLoadMore = useCallback(() => {
    fetchMoreData({ searchText });
  }, [searchText, fetchMoreData]);

  const renderItem = useCallback(({ item }) => {
    if (item.empty) {
      return <View style={[productsStyles.itemStyle, productsStyles.itemInvisible]} />;
    }
    return (
      <ProductsList
        item={item}
        onPress={() => handleCardPress(item)}
        showQuickAdd={true}
        onQuickAdd={handleQuickAdd}
      />
    );
  }, [handleCardPress, handleQuickAdd]);

  const formattedData = useMemo(() => formatData(data, 3), [data]);

  const renderEmptyState = useCallback(() => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_data.png')} message={''} />
  ), []);

  const keyExtractor = useCallback((item, index) => `pos-product-${item.id || index}`, []);

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
    if (loading && data.length === 0 && hasAttemptedFetchRef.current) return null;
    if (data.length === 0 && !loading && hasAttemptedFetchRef.current) return renderEmptyState();
    if (data.length > 0) return renderContent();
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

      {/* Floating "Go to Register" button — POS Products only.
          Returns to TakeoutDelivery (the register / cart screen) where the
          user can review the cart and place the order. */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        activeOpacity={0.85}
        style={floatingStyles.btn}
      >
        <MaterialIcons name="shopping-cart" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={floatingStyles.text}>Go to Register</Text>
      </TouchableOpacity>

      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const floatingStyles = StyleSheet.create({
  btn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E294E',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 28,
    ...Platform.select({
      ios: { shadowColor: '#2E294E', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.3,
  },
});

export default POSProducts;
