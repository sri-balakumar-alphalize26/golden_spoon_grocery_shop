import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import {
  fetchProductsOdoo,
  fetchPosCategoriesOdoo,
  fetchPosCategoryCountsOdoo,
} from '@api/services/generalApi';
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
import { FABButton } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;

// Odoo's standard 12-slot kanban colour palette (web/static/src/scss/variables.scss).
// Index 0 means "no colour set" — render the chip with the default navy/grey style.
const ODOO_COLORS = [
  null,       // 0 — no colour
  '#F06050',  // 1 red
  '#F4A460',  // 2 orange
  '#F7CD1F',  // 3 yellow
  '#6CC1ED',  // 4 light blue
  '#814968',  // 5 dark purple
  '#EB7E7F',  // 6 salmon
  '#2C8397',  // 7 teal
  '#475577',  // 8 dark blue
  '#D6145F',  // 9 fuchsia
  '#30C381',  // 10 green
  '#9365B8',  // 11 purple
];
const colorFor = (idx) => {
  const i = Number(idx) || 0;
  return ODOO_COLORS[i] || null;
};

// Pick a readable foreground colour for any given background.
const readableFg = (hex) => {
  if (!hex) return NAVY;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#1a1a2e' : '#fff';
};

const ProductsScreen = ({ navigation, route }) => {
  const categoryId = route?.params?.categoryId || '';
  useEffect(() => {
    console.log('ProductsScreen: categoryId:', categoryId);
  }, [categoryId]);
  const { fromCustomerDetails } = route.params || {};

  const { addProduct, setCurrentCustomer } = useProductStore();

  // ⬇️ CHANGE: hook now uses fetchProductsOdoo
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  const [posCategories, setPosCategories] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({ all: 0 });
  const [selectedPosCategory, setSelectedPosCategory] = useState(null);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, categoryId, posCategoryId: selectedPosCategory }),
    500
  );

  const hasAttemptedFetchRef = useRef(false);

  // Always refetch products + counts on focus so any edit/create made on
  // another screen shows up immediately when the user lands back here.
  useFocusEffect(
    useCallback(() => {
      hasAttemptedFetchRef.current = true;
      fetchData({ searchText, categoryId, posCategoryId: selectedPosCategory });
      // Re-pull categories + counts so freshly-created products bump their chip count.
      (async () => {
        try {
          const cats = await fetchPosCategoriesOdoo();
          const ids = (cats || []).map((c) => c.id).filter(Boolean);
          const counts = await fetchPosCategoryCountsOdoo(ids);
          setPosCategories(cats || []);
          setCategoryCounts(counts || { all: 0 });
        } catch (e) {
          // best-effort; chip bar simply shows "All (0)" if it fails
        }
      })();
    }, [categoryId, searchText, selectedPosCategory])
  );

  // If opened from POS, ensure cart owner is the POS guest so quick-add works
  useEffect(() => {
    if (fromCustomerDetails || route?.params?.fromPOS) {
      try { setCurrentCustomer('pos_guest'); } catch (e) { /* ignore */ }
    }
  }, [route?.params?.fromPOS, fromCustomerDetails]);

  const handleLoadMore = useCallback(() => {
    fetchMoreData({ searchText, categoryId, posCategoryId: selectedPosCategory });
  }, [searchText, categoryId, selectedPosCategory, fetchMoreData]);

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

  const renderCategoryBar = () => {
    if (!posCategories || posCategories.length === 0) return null;
    return (
      <View style={chipStyles.bar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={chipStyles.scroll}
        >
          <Chip
            label={`All (${categoryCounts.all ?? 0})`}
            active={!selectedPosCategory}
            onPress={() => setSelectedPosCategory(null)}
          />
          {posCategories.map((c) => (
            <Chip
              key={c.id}
              label={`${c.name} (${categoryCounts[c.id] ?? 0})`}
              active={selectedPosCategory === c.id}
              tint={colorFor(c.color)}
              onPress={() => setSelectedPosCategory(c.id)}
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder="Search Products"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      {renderCategoryBar()}
      <RoundedContainer>
        {renderProducts()}
        {!route?.params?.fromPOS && !fromCustomerDetails ? (
          <FABButton onPress={() => navigation.navigate('ProductCreationForm')} />
        ) : null}
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const Chip = ({ label, active, tint, onPress }) => {
  // When the POS category has a colour set in Odoo, paint the chip with it.
  // Active state thickens the border (in dark navy) so the user sees the
  // selection regardless of the underlying tint.
  const tinted = !!tint;
  const bg = tinted ? tint : (active ? NAVY : '#F3F4F6');
  const border = tinted ? (active ? '#1a1a2e' : tint) : NAVY;
  const fg = tinted ? readableFg(tint) : (active ? '#fff' : NAVY);
  const borderWidth = tinted && active ? 2.5 : 1.5;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        chipStyles.chip,
        { backgroundColor: bg, borderColor: border, borderWidth },
        active && !tinted && chipStyles.chipActive,
      ]}
    >
      <Text style={[chipStyles.chipText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const chipStyles = StyleSheet.create({
  bar: {
    height: 48,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  scroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: NAVY,
    borderColor: NAVY,
    ...Platform.select({
      ios: { shadowColor: NAVY, shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  chipText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  chipTextActive: {
    color: '#fff',
  },
});

export default ProductsScreen;
