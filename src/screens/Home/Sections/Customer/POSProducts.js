import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
import {
  fetchProductsByTemplateOdoo,
  fetchPosCategoriesOdoo,
  fetchPosCategoryCountsOdoo,
  fetchProductTemplateCountOdoo,
  fetchPosConfigCategories,
  fetchProductByBarcodeOdoo,
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

const POSProducts = ({ navigation, route }) => {
  // Active register id — passed through from TakeoutDelivery so we can scope
  // categories and products to just this pos.config (matches Odoo Web POS).
  const registerId = route?.params?.registerId || null;

  const { data, loading, fetchData, fetchMoreData } = useDataFetching(
    fetchProductsByTemplateOdoo,
    { getDedupeKey: productTemplateKey }
  );
  const { addProduct, setCurrentCustomer } = useProductStore();

  const [posCategories, setPosCategories] = useState([]);
  const [selectedPosCategory, setSelectedPosCategory] = useState(null);
  const [categoryCounts, setCategoryCounts] = useState({ all: 0 });
  const [totalCount, setTotalCount] = useState(0);
  // Scanner "Product Not Found" popup — fired by addProductByBarcode when
  // the barcode API returns no match or a row without an id we can use.
  const [notFoundVisible, setNotFoundVisible] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState('');
  // pos.config.iface_available_categ_ids snapshot. When `limit` is true we
  // pass `allowedCategoryIds` to every product + category fetch so the cashier
  // only sees what's configured for this register.
  const [configFilter, setConfigFilter] = useState({ limit: false, categoryIds: [] });
  const configLoadedRef = useRef(false);

  const allowedIds = configFilter.limit && configFilter.categoryIds.length
    ? configFilter.categoryIds
    : null;

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, posCategoryId: selectedPosCategory, allowedCategoryIds: allowedIds }),
    500
  );

  const hasLoadedRef = useRef(false);
  const lastSearchRef = useRef('');
  const lastCategoryRef = useRef(null);
  const hasAttemptedFetchRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      try { setCurrentCustomer('pos_guest'); } catch (_) {}

      // One-shot lookup of pos.config.iface_available_categ_ids the first
      // time POSProducts focuses. Cached in state for the lifetime of the
      // screen — registers don't change category config mid-session.
      const ensureConfigFilter = async () => {
        if (configLoadedRef.current || !registerId) return null;
        try {
          const f = await fetchPosConfigCategories({ configId: registerId });
          configLoadedRef.current = true;
          setConfigFilter(f);
          return f;
        } catch (_) {
          configLoadedRef.current = true;
          return null;
        }
      };

      const doFetch = async () => {
        const f = await ensureConfigFilter();
        const allowed = (f && f.limit && f.categoryIds.length)
          ? f.categoryIds
          : allowedIds;

        const searchChanged = lastSearchRef.current !== searchText;
        const categoryChanged = lastCategoryRef.current !== selectedPosCategory;
        if (!hasLoadedRef.current || searchChanged || categoryChanged) {
          hasAttemptedFetchRef.current = true;
          fetchData({ searchText, posCategoryId: selectedPosCategory, allowedCategoryIds: allowed });
          hasLoadedRef.current = true;
          lastSearchRef.current = searchText;
          lastCategoryRef.current = selectedPosCategory;
        }

        // Total templates matching the current filter — drives "Showing X / Y".
        fetchProductTemplateCountOdoo({
          searchText,
          posCategoryId: selectedPosCategory,
          allowedCategoryIds: allowed,
        }).then((total) => setTotalCount(total)).catch(() => setTotalCount(0));

        // Refresh POS category chips + their per-category counts on focus so
        // newly added/edited categories show up without requiring an app restart.
        try {
          const cats = await fetchPosCategoriesOdoo({ allowedCategoryIds: allowed });
          const ids = (cats || []).map((c) => c.id).filter(Boolean);
          const counts = await fetchPosCategoryCountsOdoo(ids, { allowedCategoryIds: allowed });
          setPosCategories(cats || []);
          setCategoryCounts(counts || { all: 0 });
        } catch (_) {
          // best-effort; chip bar simply hides if it fails
        }
      };

      doFetch();
    }, [searchText, selectedPosCategory, registerId, allowedIds])
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
      const rawId = String(item.id);
      const { getCurrentCart } = useProductStore.getState();
      const cart = getCurrentCart() || [];
      // Match across all three id shapes — Add to POS Cart writes raw int,
      // ProductsScreen + writes raw int, this + writes prefixed. Without
      // this widened lookup, a row written by Add-to-POS-Cart wouldn't be
      // recognised here and we'd add a duplicate.
      const existing = cart.find((c) =>
        String(c.id) === cartId ||
        String(c.id) === rawId ||
        String(c.remoteId) === rawId
      );
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
    fetchMoreData({ searchText, posCategoryId: selectedPosCategory, allowedCategoryIds: allowedIds });
  }, [searchText, selectedPosCategory, fetchMoreData, allowedIds]);

  // Scanner flow — ported verbatim from employee_attendance Sales Order tile,
  // which the user pointed at as the known-working reference. Calls
  // product.product.search_read directly via fetchProductByBarcodeOdoo and
  // pushes straight to the cart store. We still gate on the existing cart
  // contents so the "Already Added" feedback matches the `+` button's UX.
  const addProductByBarcode = useCallback(async (barcode) => {
    if (!barcode) return;
    try {
      const results = await fetchProductByBarcodeOdoo(String(barcode));
      console.log('[POSProducts] scan:', barcode, '→', results?.length || 0, 'hit(s)', results?.[0]);
      if (!results || results.length === 0) {
        setNotFoundBarcode(String(barcode));
        setNotFoundVisible(true);
        return;
      }
      const p = results[0];
      const item = {
        id: p.id,
        name: p.product_name,
        product_name: p.product_name,
        default_code: p.code,
        lst_price: Number(p.price || 0),
        image_url: p.image_url || null,
        categ_id: p.category ? [p.category.id, p.category.name] : false,
      };
      handleQuickAdd(item);
    } catch (e) {
      console.error('[POSProducts] barcode scan error:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Scan failed', text2: e?.message || 'Try again' });
    }
  }, [handleQuickAdd]);

  const handleOpenScanner = useCallback(() => {
    navigation.navigate('Scanner', {
      onScan: async (barcode) => {
        // Close the scanner first so the user lands back on POSProducts.
        navigation.goBack();
        await addProductByBarcode(String(barcode || ''));
      },
    });
  }, [navigation, addProductByBarcode]);

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

      {/* Floating action row — scanner FAB on the left, "Go to Register"
          pill on the right. Both at bottom-right of POS Products. */}
      <View style={floatingStyles.row}>
        <TouchableOpacity
          onPress={handleOpenScanner}
          activeOpacity={0.85}
          style={floatingStyles.scanFab}
        >
          <MaterialIcons name="qr-code-scanner" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
          style={floatingStyles.btn}
        >
          <MaterialIcons name="shopping-cart" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={floatingStyles.text}>Go to Register</Text>
        </TouchableOpacity>
      </View>

      <OverlayLoader visible={loading} />

      {/* "Product Not Found" popup — fired by the scanner FAB when the
          scanned barcode doesn't map to any product. Styled like the
          rest of the app's confirm dialogs (white card + navy border +
          red icon disk + single OK button). */}
      <Modal
        visible={notFoundVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotFoundVisible(false)}
      >
        <View style={notFoundStyles.bg}>
          <View style={notFoundStyles.card}>
            <View style={notFoundStyles.iconDisk}>
              <MaterialIcons name="search-off" size={28} color="#B91C1C" />
            </View>
            <Text style={notFoundStyles.title}>Product Not Found</Text>
            <Text style={notFoundStyles.text}>
              {`No product matches the scanned barcode${notFoundBarcode ? ` ${notFoundBarcode}` : ''}. Try scanning again or add the product manually.`}
            </Text>
            <TouchableOpacity
              onPress={() => setNotFoundVisible(false)}
              style={notFoundStyles.okBtn}
              activeOpacity={0.85}
            >
              <Text style={notFoundStyles.okBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // The whole row is absolute-positioned; individual children are static
  // inside it so the scanner FAB sits 12px to the left of the pill button.
  row: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E294E',
    ...Platform.select({
      ios: { shadowColor: '#2E294E', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  btn: {
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

// "Product Not Found" popup — styled like the rest of the app's confirm
// dialogs: white card with navy 2px border, red icon disk, navy OK button.
const notFoundStyles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: NAVY,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  iconDisk: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#1a1a2e', marginBottom: 8 },
  text: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  okBtn: {
    backgroundColor: NAVY,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  okBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
});

export default POSProducts;
