import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { NavigationHeader } from '@components/Header';
import ProductsList from '@components/Product/ProductsList';
import useDataFetching from '@hooks/useDataFetching';
import { fetchProductsOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { useProductStore } from '@stores/product';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';

const POSProducts = ({ navigation }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);
  const { addProduct, setCurrentCustomer } = useProductStore();

  // Use ref to track if initial data has been loaded
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setCurrentCustomer('pos_guest');
      // Only fetch if not already loaded
      if (!hasLoadedRef.current) {
        fetchData({ searchText: '', limit: 50 });
        hasLoadedRef.current = true;
      }
    }, [])
  );

  useEffect(() => {
    if (data && data.length > 0) {
      console.log('[POSProducts] Fetched products count:', data.length);
      console.log('[POSProducts] Product details:', data.map(p => ({
        id: p.id,
        name: p.name || p.product_name || p.display_name,
        price: p.lst_price ?? p.price ?? p.list_price ?? p.price_unit,
        code: p.default_code || p.product_code,
        category: Array.isArray(p.categ_id) ? p.categ_id[1] : p.category_name,
        image_url: p.image_url || p.image_1920
      })));
    }
  }, [data]);

  const mapToStoreProduct = (p) => {
    return {
      id: `prod_${p.id}`,
      remoteId: p.id,
      name: p.name || p.product_name || p.display_name || p.product_name || 'Product',
      price: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
      price_unit: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
      quantity: 1,
      qty: 1,
      image_url: p.image_url || p.image_1920 || null,
      product_code: p.default_code || p.product_code || p.code || null,
      category: { category_name: p.categ_id && Array.isArray(p.categ_id) ? p.categ_id[1] : (p.category_name || '') }
    };
  };

  const handlePress = useCallback((item) => {
    console.log('[POSProducts] Product clicked:', {
      id: item.id,
      name: item.name || item.product_name || item.display_name,
      price: item.lst_price ?? item.price ?? item.list_price ?? item.price_unit,
      code: item.default_code || item.product_code,
      category: Array.isArray(item.categ_id) ? item.categ_id[1] : item.category_name,
      raw_item: item
    });
    const prod = mapToStoreProduct(item);
    console.log('[POSProducts] Mapped product for store:', prod);
    addProduct(prod);
    navigation.goBack();
  }, [addProduct, navigation]);

  // Memoize formatted data for 3-column grid
  const formattedData = useMemo(() => formatData(data, 3), [data]);

  // Memoize renderItem
  const renderItem = useCallback(({ item }) => {
    if (item.empty) {
      return <View style={{ flex: 1, margin: 6 }} />;
    }
    return (
      <TouchableOpacity onPress={() => handlePress(item)}>
        <ProductsList item={item} onPress={() => handlePress(item)} showQuickAdd={false} />
      </TouchableOpacity>
    );
  }, [handlePress]);

  // Memoize keyExtractor
  const keyExtractor = useCallback((item, index) => `pos-product-${item.id || index}`, []);

  const handleLoadMore = useCallback(() => {
    fetchMoreData({});
  }, [fetchMoreData]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />
      <FlashList
        data={formattedData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={3}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        estimatedItemSize={150}
        removeClippedSubviews={true}
        maxToRenderPerBatch={15}
        updateCellsBatchingPeriod={50}
        initialNumToRender={12}
        windowSize={5}
        contentContainerStyle={{ padding: 8 }}
      />
      <OverlayLoader visible={loading} />
    </View>
  );
};

export default POSProducts;
