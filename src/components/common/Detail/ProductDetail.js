import React, { useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, Modal, StyleSheet, Dimensions, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchInventoryDetailsByName, fetchProductDetails } from '@api/details/detailApi';
import { fetchProductDetailsOdoo } from '@api/services/generalApi';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from '@components/Loader';
import { CustomListModal, EmployeeListModal } from '@components/Modal';
import { reasons } from '@constants/dropdownConst';
import { fetchEmployeesDropdown } from '@api/dropdowns/dropdownApi';
import { Button } from '../Button';
import { useProductStore } from '@stores/product';
import { formatCurrency } from '@utils/currency';
import { FeatureGate } from '@components/FeatureGate';

const ProductDetail = ({ navigation, route }) => {
  const { detail = {}, fromCustomerDetails = {} } = route?.params || {};
  // Seed with whatever the list passed in so the screen renders immediately
  // (name, price, image_url) instead of flashing "No product details available"
  // while the Odoo fetch round-trips.
  const [details, setDetails] = useState(() => ({ ...detail }));
  const [loading, setLoading] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [getDetail, setGetDetail] = useState(null);
  const [isVisibleCustomListModal, setIsVisibleCustomListModal] = useState(false);
  const [isVisibleEmployeeListModal, setIsVisibleEmployeeListModal] = useState(false);
  const [employee, setEmployee] = useState([]);
  const [isImageModalVisible, setImageModalVisible] = useState(false);
  const currentUser = useAuthStore((state) => state.user);
  const currency = useAuthStore((state) => state.currency);
  const decimalAccuracy = useAuthStore((state) => state.decimalAccuracy);
  useEffect(() => { console.log('[CURRENCY:RENDER] ProductDetail', currency); }, [currency]);
  useEffect(() => { console.log('[CURRENCY:RENDER] ProductDetail decimalAccuracy=', decimalAccuracy); }, [decimalAccuracy]);
  const addProductStore = useProductStore((state) => state.addProduct);

  useEffect(() => {
    console.log('ProductDetail details:', details);
  }, [details]);

  const isResponsibleOrEmployee = (inventoryDetails) => {
    const responsiblePersonId = inventoryDetails?.responsible_person?._id;
    const employeeIds = inventoryDetails?.employees?.map((e) => e._id) || [];
    const tempAssigneeIds = inventoryDetails?.temp_assignee?.map((t) => t._id) || [];
    return (
      currentUser &&
      (currentUser.related_profile?._id === responsiblePersonId ||
        employeeIds.includes(currentUser.related_profile?._id) ||
        tempAssigneeIds.includes(currentUser.related_profile?._id))
    );
  };

  const isOdooProduct = !!detail.id && !detail._id;
  const refreshAt = route?.params?.refreshAt ?? null;

  // Reset the failed-image flag whenever the underlying image source changes,
  // so a freshly-uploaded image gets a fresh chance to render after Save.
  useEffect(() => {
    setHeroImageFailed(false);
  }, [details?.image_url]);

  const heroImageUri = (() => {
    const u = typeof details?.image_url === 'string' ? details.image_url : '';
    if (!u) return '';
    // Reject relative / malformed URLs that RN Image can't load anyway.
    if (u.startsWith('data:image') || u.startsWith('http')) return u;
    return '';
  })();
  const showNoImage = !heroImageUri || heroImageFailed;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const employeeDropdown = await fetchEmployeesDropdown();
        const extract = employeeDropdown.map((e) => ({ id: e._id, label: e.name }));
        setEmployee(extract);
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
      }
    };
    fetchData();
  }, []);

  const handleBoxOpeningRequest = (value) => {
    if (value) {
      navigation.navigate('InventoryForm', { reason: value, inventoryDetails: getDetail });
    }
  };

  const handleSelectTemporaryAssignee = () => {};

  const productDetails = async () => {
    try {
      const productId = detail?._id;
      if (!productId) return;
      const response = await fetchProductDetails(productId);
      setDetails(response[0] || {});
    } catch (e) {
      console.error('Error fetching product details:', e);
    }
  };

  useEffect(() => {
    if (isOdooProduct) {
      const loadOdooDetails = async () => {
        try {
          const od = await fetchProductDetailsOdoo(detail.id);
          setDetails({
            ...detail,
            id: detail.id,
            product_name: od?.product_name || detail.product_name || detail.name,
            // Trust the fresh fetch as authoritative for image_url. If `od` came
            // back without an image (empty string), don't fall back to the
            // possibly-stale seed value.
            image_url: (od && Object.prototype.hasOwnProperty.call(od, 'image_url'))
              ? (od.image_url || '')
              : (detail.image_url || ''),
            cost: od?.cost ?? 0,
            sale_price: od?.sale_price ?? od?.price ?? detail.price ?? 0,
            barcode: od?.barcode || detail.barcode || '',
            minimal_sales_price: od?.minimal_sales_price ?? null,
            inventory_ledgers: od?.inventory_ledgers || [],
            total_product_quantity: od?.total_product_quantity ?? 0,
            inventory_box_products_details: od?.inventory_box_products_details || [],
            product_code: od?.product_code || detail.code || detail.default_code || null,
            uom: od?.uom || detail.uom || null,
            categ_id: od?.categ_id || detail.categ_id || null,
            category_name: od?.category_name || (Array.isArray(od?.categ_id) ? od.categ_id[1] : null) || (Array.isArray(detail?.categ_id) ? detail.categ_id[1] : null),
            product_description: od?.product_description || '',
          });
        } catch (e) {
          console.error('Error loading Odoo product details:', e);
          setDetails({
            ...detail,
            id: detail.id,
            product_name: detail.product_name || detail.name,
            image_url: detail.image_url,
            cost: 0,
            sale_price: detail.price ?? 0,
            barcode: detail.barcode || '',
            minimal_sales_price: null,
            inventory_ledgers: [],
            total_product_quantity: 0,
            uom: detail.uom || null,
          });
        }
      };
      loadOdooDetails();
    } else if (detail?._id) {
      productDetails();
    } else {
      setDetails(detail || {});
    }
  }, [detail, isOdooProduct, refreshAt]);

  const handleBoxNamePress = async (boxName, warehouseId) => {
    setLoading(true);
    try {
      const inventoryDetails = await fetchInventoryDetailsByName(boxName, warehouseId);
      if (inventoryDetails.length > 0) {
        const d = inventoryDetails[0];
        setGetDetail(d);
        if (isResponsibleOrEmployee(d)) setIsVisibleCustomListModal(true);
        else navigation.navigate('InventoryDetails', { inventoryDetails: d });
      } else {
        showToastMessage('No inventory box found for this box no');
      }
    } catch (error) {
      console.error('Error fetching inventory details by name:', error);
      showToastMessage('Error fetching inventory details');
    } finally {
      setLoading(false);
    }
  };

  const renderStockDetails = () => {
    const { inventory_ledgers = [] } = details || {};
    const filteredLedgers = inventory_ledgers.filter(
      (l) => l?.warehouse_name?.toLowerCase() !== 'inv adj' && l?.warehouse_name?.toLowerCase() !== 'inventory adjustment'
    );
    if (!filteredLedgers || filteredLedgers.length === 0) return null;

    return (
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Warehouse Stock</Text>
        {filteredLedgers.map((ledger, index) => (
          <View key={index} style={s.warehouseRow}>
            <View style={s.warehouseInfo}>
              <MaterialIcons name="warehouse" size={18} color={COLORS.primaryThemeColor} />
              <Text style={s.warehouseName}>{ledger?.warehouse_name || '-'}</Text>
            </View>
            <Text style={s.warehouseQty}>{ledger?.total_warehouse_quantity}</Text>
          </View>
        ))}
      </View>
    );
  };

  const handleAddToPosCart = () => {
    const { getCurrentCart, addProduct, setCurrentCustomer } = useProductStore.getState();
    setCurrentCustomer('pos_guest');
    const currentProducts = getCurrentCart();
    const newProduct = {
      id: details.id ?? details._id,
      name: details.product_name || details.name,
      quantity: 1,
      price: details.cost ?? details.price ?? 0,
      imageUrl: details.image_url,
    };
    if (!newProduct.id) {
      showToastMessage('Product ID missing, cannot add to cart');
      return;
    }
    if (currentProducts.some((p) => p.id === newProduct.id)) {
      showToastMessage('Product already added to POS cart');
    } else {
      addProduct(newProduct);
      showToastMessage('Added to POS cart');
      navigation.goBack();
    }
  };

  const categoryDisplay =
    details?.category?.category_name ||
    details?.category_name ||
    (Array.isArray(details?.categ_id) ? details.categ_id[1] : null) ||
    'N/A';

  const fallbackCurrency = { symbol: '', name: '', position: 'before' };
  const priceRaw = details.sale_price ?? details.price;
  const priceDisplay = (priceRaw !== null && priceRaw !== undefined && priceRaw !== '')
    ? formatCurrency(priceRaw, currency || fallbackCurrency)
    : null;
  const costDisplay = (details.cost !== null && details.cost !== undefined && Number(details.cost) > 0)
    ? formatCurrency(details.cost, currency || fallbackCurrency)
    : null;
  const minSalesDisplay = details.minimal_sales_price
    ? formatCurrency(details.minimal_sales_price, currency || fallbackCurrency)
    : null;
  const onHandDisplay = (() => {
    const q = details.total_product_quantity;
    if (q === undefined || q === null) return null;
    const u = details?.uom?.uom_name || (Array.isArray(details?.uom) ? details.uom[1] : '');
    return u ? `${q} ${u}` : String(q);
  })();
  const barcodeDisplay = (details.barcode && String(details.barcode).trim()) || null;
  const internalRefDisplay = (details.product_code && String(details.product_code).trim()) || null;
  const categoryDisplayOrNull = (categoryDisplay && categoryDisplay !== 'N/A') ? categoryDisplay : null;

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Product Details"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        {details && Object.keys(details).length > 0 ? (
          <>
            <View style={s.heroCard}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => { if (!showNoImage) setImageModalVisible(true); }}
                style={s.heroImageWrap}
              >
                {showNoImage ? (
                  <View style={s.noImageBox}>
                    <MaterialIcons name="image-not-supported" size={36} color="#cbd5e1" />
                    <Text style={s.noImageText}>No Image</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: heroImageUri }}
                    style={s.heroImage}
                    resizeMode="contain"
                    onError={() => setHeroImageFailed(true)}
                  />
                )}
              </TouchableOpacity>
              <View style={s.heroInfo}>
                <Text style={s.heroName} numberOfLines={3}>
                  {(details.product_name || details.name || 'Product').trim()}
                </Text>
                <View style={s.priceTag}>
                  <Text style={s.priceTagText}>{priceDisplay}</Text>
                </View>
                {details.product_description ? (
                  <Text style={s.heroDesc} numberOfLines={4}>{details.product_description}</Text>
                ) : null}
              </View>
            </View>

            <View style={s.sectionCard}>
              <Text style={s.sectionTitle}>Details</Text>
              <DetailRow icon="category" label="Category" value={categoryDisplayOrNull} />
              <DetailRow icon="sell" label="Sales Price" value={priceDisplay} />
              <DetailRow icon="payments" label="Cost" value={costDisplay} />
              {!route?.params?.fromPOS && (
                <DetailRow icon="trending-down" label="Minimum Sales Price" value={minSalesDisplay} />
              )}
              {!route?.params?.fromPOS && (
                <DetailRow icon="inventory-2" label="On Hand Quantity" value={onHandDisplay} />
              )}
              <DetailRow
                icon="straighten"
                label="Unit of Measure"
                value={
                  details?.uom?.uom_name ||
                  (Array.isArray(details?.uom) ? details.uom[1] : null)
                }
              />
              <DetailRow icon="qr-code-scanner" label="Barcode" value={barcodeDisplay} />
              <DetailRow icon="tag" label="Internal Reference" value={internalRefDisplay} />
              {isOdooProduct && !route?.params?.fromPOS ? (
                <FeatureGate featureKey="products.edit">
                  <TouchableOpacity
                    style={s.editProductBtn}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('ProductCreationForm', { productId: detail.id })}
                  >
                    <MaterialIcons name="edit" size={18} color="#fff" />
                    <Text style={s.editProductBtnText}>Edit Product</Text>
                  </TouchableOpacity>
                </FeatureGate>
              ) : null}
            </View>

            {!route?.params?.fromPOS && renderStockDetails()}

            {route?.params?.fromPOS ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
                <Button title={'Add to POS Cart'} onPress={handleAddToPosCart} />
              </View>
            ) : null}
          </>
        ) : null}
      </RoundedScrollContainer>

      <Modal visible={isImageModalVisible} transparent animationType="fade">
        <View style={s.imageModalBg}>
          <TouchableOpacity
            style={s.imageCloseBtn}
            onPress={() => setImageModalVisible(false)}
            accessibilityLabel="Close image"
            accessibilityRole="button"
          >
            <Text style={{ color: '#111', fontSize: 28, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
          {showNoImage ? (
            <View style={[s.fullImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f8fa' }]}>
              <MaterialIcons name="image-not-supported" size={64} color="#cbd5e1" />
              <Text style={[s.noImageText, { fontSize: 14, marginTop: 8 }]}>No Image</Text>
            </View>
          ) : (
            <Image
              source={{ uri: heroImageUri }}
              style={s.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <CustomListModal
        isVisible={isVisibleCustomListModal}
        items={reasons}
        title="Select Reason"
        onClose={() => setIsVisibleCustomListModal(false)}
        onValueChange={handleBoxOpeningRequest}
        onAdd={() => {
          setIsVisibleEmployeeListModal(true);
          setIsVisibleCustomListModal(false);
        }}
      />
      <EmployeeListModal
        isVisible={isVisibleEmployeeListModal}
        items={employee}
        boxId={getDetail?._id}
        title="Select Assignee"
        onClose={() => setIsVisibleEmployeeListModal(false)}
        onValueChange={handleSelectTemporaryAssignee}
      />

      {loading && <OverlayLoader visible={true} backgroundColor={true} />}
    </SafeAreaView>
  );
};

const DetailRow = ({ icon, label, value }) => {
  const display =
    value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <View style={s.detailRow}>
      <View style={s.detailIconBox}>
        <MaterialIcons name={icon} size={18} color={COLORS.primaryThemeColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={s.detailValue} numberOfLines={2}>{display}</Text>
      </View>
    </View>
  );
};

export default ProductDetail;

const { width, height } = Dimensions.get('window');

const cardShadow = Platform.select({
  android: { elevation: 3 },
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
});

const s = StyleSheet.create({
  heroCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 18,
    padding: 12,
    ...cardShadow,
  },
  heroImageWrap: {
    width: 130,
    height: 160,
    borderRadius: 14,
    backgroundColor: '#F8F8FA',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: '100%' },
  noImageBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  heroInfo: { flex: 1, paddingLeft: 14, paddingVertical: 4 },
  heroName: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    lineHeight: 22,
  },
  priceTag: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: COLORS.primaryThemeColor,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  priceTagText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  heroDesc: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray,
    lineHeight: 16,
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 6,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F4',
  },
  detailIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryThemeColor + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
  },

  warehouseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F4',
  },
  warehouseInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warehouseName: {
    marginLeft: 6,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
  },
  warehouseQty: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: COLORS.orange,
  },

  imageModalBg: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fullImage: {
    width: Math.min(width * 0.9, 900),
    height: Math.min(height * 0.65, 800),
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  imageCloseBtn: {
    position: 'absolute',
    top: 28,
    right: 18,
    zIndex: 10,
    padding: 8,
  },

  editProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F47B20',
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#F47B20', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  editProductBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
});
