import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import {
  fetchProductsByTemplateOdoo,
  fetchPosCategoriesOdoo,
  fetchPosCategoryCountsOdoo,
  fetchProductTemplateCountOdoo,
} from '@api/services/generalApi';
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
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;

// Odoo's standard 12-slot kanban colour palette so POS chips match the
// cashier's web POS view (see screenshot: Upper body / Lower body / Others).
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

const readableFg = (hex) => {
  if (!hex) return NAVY;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#1a1a2e' : '#fff';
};

// Odoo's product.product is per-variant — a single t-shirt template with size
// S/M/L returns 3 records. POS UI should show one tile per template, so we
// dedupe by `product_tmpl_id` (falling back to id when the field is missing).
const productTemplateKey = (item) => {
  if (!item) return null;
  if (Array.isArray(item.product_tmpl_id) && item.product_tmpl_id[0] != null) {
    return item.product_tmpl_id[0];
  }
  return item.id;
};

const POSProducts = ({ navigation }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(
    fetchProductsByTemplateOdoo,
    { getDedupeKey: productTemplateKey }
  );
  const { addProduct, setCurrentCustomer } = useProductStore();

  const [posCategories, setPosCategories] = useState([]);
  const [selectedPosCategory, setSelectedPosCategory] = useState(null);
  const [categoryCounts, setCategoryCounts] = useState({ all: 0 });
  const [totalCount, setTotalCount] = useState(0);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, posCategoryId: selectedPosCategory, posOnly: true }),
    500
  );

  const hasLoadedRef = useRef(false);
  const lastSearchRef = useRef('');
  const lastCategoryRef = useRef(null);
  const hasAttemptedFetchRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      try { setCurrentCustomer('pos_guest'); } catch (_) {}

      const searchChanged = lastSearchRef.current !== searchText;
      const categoryChanged = lastCategoryRef.current !== selectedPosCategory;
      if (!hasLoadedRef.current || searchChanged || categoryChanged) {
        hasAttemptedFetchRef.current = true;
        fetchData({ searchText, posCategoryId: selectedPosCategory, posOnly: true });
        hasLoadedRef.current = true;
        lastSearchRef.current = searchText;
        lastCategoryRef.current = selectedPosCategory;
      }

      // Total templates matching the current filter — drives "Showing X / Y".
      fetchProductTemplateCountOdoo({
        searchText,
        posCategoryId: selectedPosCategory,
        posOnly: true,
      }).then((total) => setTotalCount(total)).catch(() => setTotalCount(0));

      // Refresh POS category chips + their per-category counts on focus so
      // newly added/edited categories show up without requiring an app restart.
      (async () => {
        try {
          const cats = await fetchPosCategoriesOdoo();
          const ids = (cats || []).map((c) => c.id).filter(Boolean);
          const counts = await fetchPosCategoryCountsOdoo(ids, { posOnly: true });
          setPosCategories(cats || []);
          setCategoryCounts(counts || { all: 0 });
        } catch (e) {
          // best-effort; chip bar simply hides if it fails
        }
      })();
    }, [searchText, selectedPosCategory])
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
    fetchMoreData({ searchText, posCategoryId: selectedPosCategory, posOnly: true });
  }, [searchText, selectedPosCategory, fetchMoreData]);

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
      <View style={countStripStyles.strip}>
        <Text style={countStripStyles.text}>
          {`Showing ${data.length}${totalCount ? ` of ${totalCount}` : ''}${loading ? ' · loading…' : ''}`}
        </Text>
      </View>
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

const Chip = ({ label, active, tint, onPress }) => {
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
});

const countStripStyles = StyleSheet.create({
  strip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
});

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
