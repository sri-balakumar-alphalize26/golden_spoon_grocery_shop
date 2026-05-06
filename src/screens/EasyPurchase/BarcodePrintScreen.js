import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, Linking, Dimensions, Platform,
} from 'react-native';
import Modal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { fetchPurchaseProducts, printBarcodeLabel } from '@api/services/easyPurchaseApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const LABEL_SIZES = [
  { id: '26x16', label: '26 × 16 mm', sub: 'Small' },
  { id: '38x25', label: '38 × 25 mm', sub: 'Standard' },
  { id: '58x39', label: '58 × 39 mm', sub: 'Large' },
];

const PRICE_TYPES = [
  { id: 'retail', label: 'Retail Price', icon: 'sell' },
  { id: 'wholesale', label: 'Wholesale Price', icon: 'inventory' },
  { id: 'both', label: 'Both', icon: 'compare-arrows' },
];

const BarcodePrintScreen = ({ navigation, route }) => {
  // Optional prefill from a Print button on an Easy Purchase line.
  // Shape: { productId, productName, productCode, productBarcode,
  //   quantity, retailPrice, wholesalePrice }
  const prefill = route?.params?.prefill || null;

  const [product, setProduct] = useState(
    prefill?.productId
      ? { id: prefill.productId, name: prefill.productName, code: prefill.productCode, barcode: prefill.productBarcode }
      : null
  );
  const [quantity, setQuantity] = useState(prefill?.quantity ? String(prefill.quantity) : '1');
  const [labelSize, setLabelSize] = useState('38x25');
  const [priceType, setPriceType] = useState('retail');
  const [retailPrice, setRetailPrice] = useState(
    prefill?.retailPrice != null ? String(prefill.retailPrice) : ''
  );
  const [wholesalePrice, setWholesalePrice] = useState(
    prefill?.wholesalePrice != null ? String(prefill.wholesalePrice) : ''
  );

  const [submitting, setSubmitting] = useState(false);
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [productLoading, setProductLoading] = useState(false);

  // Load products when picker opens or search changes
  const loadProducts = async (q) => {
    setProductLoading(true);
    try {
      const rows = await fetchPurchaseProducts({ searchText: q || '', limit: 50 });
      setProductOptions((rows || []).map((p) => ({
        id: p.id,
        label: p.display_name || p.name,
        sub: p.default_code ? `[${p.default_code}]${p.barcode ? `  •  ${p.barcode}` : ''}` : p.barcode || '',
        raw: p,
      })));
    } catch (e) {
      showToastMessage(e?.message || 'Failed to load products');
    } finally {
      setProductLoading(false);
    }
  };

  useEffect(() => {
    if (productPickerVisible) {
      const t = setTimeout(() => loadProducts(productSearch), 250);
      return () => clearTimeout(t);
    }
  }, [productSearch, productPickerVisible]);

  const onPickProduct = (p) => {
    const r = p.raw || {};
    setProduct({ id: r.id, name: r.display_name || r.name, code: r.default_code, barcode: r.barcode });
    setRetailPrice(String(r.lst_price ?? ''));
    setWholesalePrice(String(r.standard_price ?? ''));
    setProductPickerVisible(false);
  };

  const submit = async () => {
    if (!product) return showToastMessage('Pick a product');
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) return showToastMessage('Quantity must be at least 1');

    setSubmitting(true);
    try {
      const { reportUrl } = await printBarcodeLabel({
        productId: product.id,
        quantity: qty,
        labelSize,
        priceType,
        retailPrice: Number(retailPrice) || 0,
        wholesalePrice: Number(wholesalePrice) || 0,
      });
      // Open the report PDF in the system browser. The user may need to be
      // signed in to Odoo on the same browser for the cookie-protected URL.
      const supported = await Linking.canOpenURL(reportUrl);
      if (supported) {
        await Linking.openURL(reportUrl);
        showToastMessage(`Generating ${qty} label${qty > 1 ? 's' : ''}…`);
      } else {
        showToastMessage('Could not open the report URL');
      }
    } catch (e) {
      console.error('[BarcodePrint] submit', e);
      showToastMessage(e?.message || 'Failed to generate label');
    } finally {
      setSubmitting(false);
    }
  };

  const previewPrices = useMemo(() => {
    const r = Number(retailPrice) || 0;
    const w = Number(wholesalePrice) || 0;
    if (priceType === 'retail') return [`Retail: ${r.toFixed(3)}`];
    if (priceType === 'wholesale') return [`Wholesale: ${w.toFixed(3)}`];
    return [`Retail: ${r.toFixed(3)}`, `Wholesale: ${w.toFixed(3)}`];
  }, [priceType, retailPrice, wholesalePrice]);

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Print Barcode Labels" onBackPress={() => navigation.goBack()} />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>

        {/* Product picker */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Product</Text>
          <Text style={styles.label}>Pick a product *</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setProductPickerVisible(true)}>
            <Text style={styles.pickerValue}>{product?.name || 'Select a product'}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
          </TouchableOpacity>
          {product?.barcode ? (
            <Text style={styles.helpText}>
              <MaterialIcons name="qr-code" size={12} color="#6b7280" /> Existing barcode: {product.barcode}
            </Text>
          ) : product ? (
            <Text style={styles.helpText}>
              <MaterialIcons name="info-outline" size={12} color={ORANGE} /> No barcode yet — Odoo will auto-generate one.
            </Text>
          ) : null}
        </View>

        {/* Quantity */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <Text style={styles.label}>Number of labels *</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="1"
            placeholderTextColor="#999"
          />
        </View>

        {/* Label size */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Label Size</Text>
          {LABEL_SIZES.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.optionRow, labelSize === s.id && styles.optionRowActive]}
              onPress={() => setLabelSize(s.id)}
            >
              <View style={styles.radio}>
                {labelSize === s.id ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.optionLabel}>{s.label}</Text>
                <Text style={styles.optionSub}>{s.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Price type */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Price Type</Text>
          {PRICE_TYPES.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.optionRow, priceType === p.id && styles.optionRowActive]}
              onPress={() => setPriceType(p.id)}
            >
              <View style={styles.radio}>
                {priceType === p.id ? <View style={styles.radioDot} /> : null}
              </View>
              <MaterialIcons name={p.icon} size={18} color={NAVY} style={{ marginLeft: 10 }} />
              <Text style={[styles.optionLabel, { marginLeft: 8 }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Prices */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Prices</Text>

          <Text style={styles.label}>Retail Price</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={retailPrice}
            onChangeText={setRetailPrice}
            placeholder="0.000"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Wholesale Price</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={wholesalePrice}
            onChangeText={setWholesalePrice}
            placeholder="0.000"
            placeholderTextColor="#999"
          />
        </View>

        {/* Preview */}
        <View style={[styles.card, { backgroundColor: NAVY }]}>
          <Text style={[styles.sectionTitle, { color: '#fff' }]}>Preview</Text>
          <Text style={styles.previewProduct}>{product?.name || '— No product —'}</Text>
          {product?.code ? <Text style={styles.previewCode}>[{product.code}]</Text> : null}
          {previewPrices.map((p) => (
            <Text key={p} style={styles.previewPrice}>{p}</Text>
          ))}
          <Text style={styles.previewMeta}>
            {LABEL_SIZES.find((s) => s.id === labelSize)?.label} • {quantity} label{Number(quantity) === 1 ? '' : 's'}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.btn, styles.btnConfirm, submitting && { opacity: 0.6 }]}
          disabled={submitting}
          onPress={submit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialIcons name="print" size={20} color="#fff" />
              <Text style={styles.btnConfirmText}>Generate Labels</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Product picker modal */}
      <Modal
        isVisible={productPickerVisible}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.4}
        animationInTiming={250}
        animationOutTiming={200}
        backdropTransitionInTiming={250}
        backdropTransitionOutTiming={200}
        onBackdropPress={() => setProductPickerVisible(false)}
        onBackButtonPress={() => setProductPickerVisible(false)}
        style={styles.modalCenter}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Product</Text>
            <TouchableOpacity onPress={() => setProductPickerVisible(false)} style={styles.modalCloseBtn}>
              <MaterialIcons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={18} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products…"
              placeholderTextColor="#999"
              value={productSearch}
              onChangeText={setProductSearch}
              autoCorrect={false}
            />
          </View>
          {productLoading ? (
            <ActivityIndicator color={ORANGE} style={{ marginVertical: 20 }} />
          ) : (
            <FlatList
              data={productOptions}
              keyExtractor={(it) => `pp-${it.id}`}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerRow} onPress={() => onPickProduct(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerLabel}>{item.label}</Text>
                    {item.sub ? <Text style={styles.pickerSub}>{item.sub}</Text> : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyPicker}>No matches</Text>}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY, marginBottom: 8 },
  label: { fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, backgroundColor: '#fff',
  },
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pickerValue: { flex: 1, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },
  helpText: { fontSize: 11, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 6 },

  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 10, marginTop: 6,
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  optionRowActive: { borderColor: ORANGE, backgroundColor: '#fff7ed' },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: ORANGE,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ORANGE },
  optionLabel: { fontSize: 13, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  optionSub: { fontSize: 11, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium },

  previewProduct: { color: '#fff', fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 4 },
  previewCode: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 4 },
  previewPrice: { color: ORANGE, fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, marginTop: 2 },
  previewMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 8 },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnConfirm: {
    backgroundColor: ORANGE,
    shadowColor: ORANGE, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  btnConfirmText: { color: '#fff', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },

  // Center popup modal styles
  modalCenter: { margin: 24, justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.7,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    paddingBottom: 8,
    ...Platform.select({
      android: { elevation: 10 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
    }),
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY, flex: 1 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f2f2f2',
    alignItems: 'center', justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    margin: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, marginLeft: 6 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f5f5f8' },
  pickerLabel: { fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },
  pickerSub: { fontSize: 11, color: '#6b7280', marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  emptyPicker: { textAlign: 'center', padding: 30, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium },
});

export default BarcodePrintScreen;
