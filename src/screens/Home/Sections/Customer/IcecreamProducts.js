import React, { useEffect } from 'react';
import { View, FlatList } from 'react-native';
import { NavigationHeader } from '@components/Header';
import ProductsList from '@components/Product/ProductsList';
import useDataFetching from '@hooks/useDataFetching';
import { fetchProductsOdoo } from '@api/services/generalApi';

const IcecreamProducts = ({ navigation, route }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  useEffect(() => {
    // Initial fetch: search for ice cream related products
    fetchData({ searchText: 'icecream', limit: 100 });
  }, []);

  const renderItem = ({ item }) => (
    <ProductsList
      item={item}
      onPress={() => navigation.navigate('POSProducts', { selectedProduct: item })}
      showQuickAdd={true}
      onQuickAdd={(p) => navigation.navigate('POSProducts', { selectedProduct: p })}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <NavigationHeader title="Icecream Products" onBackPress={() => navigation.goBack()} />
      <FlatList
        data={data}
        keyExtractor={(i) => String(i.id ?? i.remoteId ?? i.product_id ?? Math.random())}
        renderItem={renderItem}
        numColumns={2}
        onEndReached={() => fetchMoreData({ searchText: 'icecream' })}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
};

export default IcecreamProducts;
