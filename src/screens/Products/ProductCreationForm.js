import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Platform,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import {
  createProductOdoo,
  updateProductOdoo,
  fetchPosCategoriesOdoo,
  fetchUomsOdoo,
  fetchProductDetailsOdoo,
  createPosCategoryOdoo,
  updatePosCategoryOdoo,
} from '@api/services/generalApi';
import Toast from 'react-native-toast-message';
import { useFeatureHidden } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#9CA3AF';

// Standard 12-slot Odoo kanban palette. Index 0 = "no colour" (white).
const ODOO_COLORS = [
  '#FFFFFF', '#F06050', '#F4A460', '#F7CD1F',
  '#6CC1ED', '#814968', '#EB7E7F', '#2C8397',
  '#475577', '#D6145F', '#30C381', '#9365B8',
];

const ProductCreationForm = ({ navigation, route }) => {
  const editId = route?.params?.productId || null;
  const isEdit = !!editId;
  // Defense-in-depth: even if a user reaches this form, hide Save when the
  // matching App Features key is off for them.
  const isOpHidden = useFeatureHidden(isEdit ? 'products.edit' : 'products.add');

  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(isEdit);
  // Original on-hand qty captured at prefill — used to skip the qty write
  // when the user didn't actually change it. The qty path is the most
  // failure-prone part of the save and we don't want it firing on every save.
  const originalOnHandRef = useRef(null);

  const [productName, setProductName] = useState('');
  const [salesPrice, setSalesPrice] = useState('');
  const [cost, setCost] = useState('');
  const [onHandQty, setOnHandQty] = useState('');
  const [barcode, setBarcode] = useState('');
  const [internalRef, setInternalRef] = useState('');

  const [imageUri, setImageUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);

  const [posCategories, setPosCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  // category state holds {id, name, kind: 'internal' | 'pos'} so we know which
  // Odoo field to write on save.
  const [category, setCategory] = useState(null);
  const [uom, setUom] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(null); // 'category' | 'uom' | null
  const [pickerSearch, setPickerSearch] = useState('');

  // Inline "New / Edit Category" mini-form (POS category only).
  const [addCatModalVisible, setAddCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(0);
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null); // null = create mode

  // Load POS-category + UoM lists once.
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchPosCategoriesOdoo(),
      fetchUomsOdoo(),
    ]).then(([posCats, us]) => {
      if (!alive) return;
      setPosCategories(posCats || []);
      setUoms(us || []);
    });
    return () => { alive = false; };
  }, []);

  // Edit mode: fetch the product and prefill the form.
  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    fetchProductDetailsOdoo(editId)
      .then((od) => {
        if (!alive || !od) return;
        setProductName(od.product_name || '');
        setSalesPrice(od.sale_price !== undefined && od.sale_price !== null ? String(od.sale_price) : '');
        setCost(od.cost !== undefined && od.cost !== null ? String(od.cost) : '');
        const initialQty = od.total_product_quantity ?? 0;
        setOnHandQty(String(initialQty));
        originalOnHandRef.current = String(initialQty);
        setBarcode(od.barcode || '');
        setInternalRef(od.product_code || '');
        if (od.image_url) setImageUri(od.image_url);
        // Prefer POS category when one is set on the product (it implies the
        // product is meant for POS, which is the more meaningful pick here).
        // Otherwise fall back to the internal accounting category.
        if (od.pos_category?.id) {
          setCategory({ id: od.pos_category.id, name: od.pos_category.name, kind: 'pos' });
        } else if (Array.isArray(od.categ_id) && od.categ_id.length > 1) {
          setCategory({ id: od.categ_id[0], name: od.categ_id[1], kind: 'internal' });
        }
        if (od.uom?.uom_id) {
          setUom({ id: od.uom.uom_id, name: od.uom.uom_name });
        }
      })
      .catch(() => {
        Toast.show({ type: 'error', text1: 'Failed to load product', position: 'bottom' });
      })
      .finally(() => alive && setPrefilling(false));
    return () => { alive = false; };
  }, [isEdit, editId]);

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Permission denied', text2: 'Cannot access photos', position: 'bottom' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setImageUri(asset.uri);
      setImageBase64(asset.base64 || null);
    } catch (e) {
      console.warn('Image pick failed:', e);
      Toast.show({ type: 'error', text1: 'Could not pick image', position: 'bottom' });
    }
  };

  const handleSubmit = async () => {
    if (!productName.trim()) {
      Toast.show({ type: 'error', text1: 'Product name is required', position: 'bottom' });
      return;
    }
    setSaving(true);
    try {
      // Only push qty when the user actually changed it. Otherwise the
      // stock.quant write fires every save and any failure (e.g. no internal
      // location for this user) gets reported as a partial-save error even
      // though the user didn't touch qty.
      const qtyChanged = isEdit
        ? String(onHandQty || '').trim() !== String(originalOnHandRef.current ?? '').trim()
        : (onHandQty || '') !== '';

      const payload = {
        name: productName.trim(),
        // Picker stores both Internal and POS categories — branch on `kind`
        // so we only write the matching Odoo field. The other field is left
        // untouched (undefined → omitted from the write payload).
        categId: category?.kind === 'internal' ? category.id : undefined,
        posCategoryId: category?.kind === 'pos' ? category.id : undefined,
        listPrice: salesPrice,
        standardPrice: cost,
        barcode: barcode || (isEdit ? '' : undefined),
        defaultCode: internalRef || (isEdit ? '' : undefined),
        uomId: uom?.id,
        // In edit mode only send a fresh image when the user picked one
        // (imageBase64 is null when they kept the existing photo).
        image: imageBase64 || undefined,
        onHandQty: qtyChanged ? (onHandQty || '0') : undefined,
      };
      const resp = isEdit
        ? await updateProductOdoo(editId, payload)
        : await createProductOdoo(payload);
      if (resp?.error) {
        Toast.show({
          type: 'error',
          text1: isEdit ? 'Save failed' : 'Create failed',
          text2: resp.error.message || resp.error.data?.message || 'Could not save product',
          position: 'bottom',
        });
        return;
      }
      const notSaved = Array.isArray(resp?.notSaved) ? resp.notSaved : [];
      const qtyFailed = resp?.qtySaved === false;
      // notSaved is edit-only (create writes a fresh record with all fields).
      // qtyFailed can fire on both create and edit when the stock.quant
      // path errors — surface it either way so the user knows the qty
      // didn't persist instead of seeing a misleading green toast.
      const hasPartialFailure = notSaved.length > 0 || qtyFailed;

      if (hasPartialFailure) {
        const labels = {
          name: 'Name',
          list_price: 'Sales Price',
          standard_price: 'Cost',
          categ_id: 'Category',
          pos_categ_ids: 'POS Category',
          available_in_pos: 'POS Visibility',
          barcode: 'Barcode',
          default_code: 'Internal Reference',
          uom_id: 'Unit of Measure',
          image_1920: 'Image',
          description_sale: 'Description',
        };
        const failed = notSaved.map((k) => labels[k] || k);
        if (qtyFailed) failed.push('On-Hand Qty');
        Toast.show({
          type: 'error',
          text1: 'Some changes did not save',
          text2: failed.join(', '),
          position: 'bottom',
          visibilityTime: 6000,
        });
        // Stay on the form so the user can retry — don't navigate away and
        // hide the lost data behind a green toast.
        return;
      }

      Toast.show({
        type: 'success',
        text1: isEdit ? 'Product updated' : 'Product created',
        position: 'bottom',
      });
      if (isEdit) {
        // Land back on ProductDetail with a fresh refreshAt so it re-fetches.
        // Also nudge the parent Products screen via setParams so its
        // useFocusEffect refetches when the user pops back to it.
        const ts = Date.now();
        const parent = navigation.getParent?.();
        try {
          (parent || navigation).setParams?.({ refreshAt: ts });
        } catch (_) {}
        navigation.navigate({ name: 'ProductDetail', params: { refreshAt: ts }, merge: true });
      } else {
        // Pop back to Products and bump refreshAt so its useFocusEffect refetches.
        navigation.navigate({ name: 'Products', params: { refreshAt: Date.now() }, merge: true });
      }
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Create failed', text2: e?.message || '', position: 'bottom' });
    } finally {
      setSaving(false);
    }
  };

  const openPicker = (which) => {
    setPickerSearch('');
    setPickerOpen(which);
  };
  const closePicker = () => setPickerOpen(null);
  const onPickerSelect = (item, kind) => {
    if (pickerOpen === 'category') {
      setCategory({ ...item, kind: kind || 'internal' });
    } else if (pickerOpen === 'uom') {
      setUom(item);
    }
    setPickerOpen(null);
  };
  const pickerTitle = pickerOpen === 'category'
    ? 'Select Category'
    : pickerOpen === 'uom'
      ? 'Select Unit of Measure'
      : '';
  const matchSearch = (it) =>
    !pickerSearch || (it.name || '').toLowerCase().includes(pickerSearch.toLowerCase());
  const filteredPosCategories = posCategories.filter(matchSearch);
  const filteredUoms = uoms.filter(matchSearch);

  const handleSaveNewCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      Toast.show({ type: 'error', text1: 'Category name is required', position: 'bottom' });
      return;
    }
    setCreatingCat(true);
    try {
      const isEditCat = !!editingCatId;
      const resp = isEditCat
        ? await updatePosCategoryOdoo(editingCatId, { name: trimmed, color: newCatColor })
        : await createPosCategoryOdoo({ name: trimmed, color: newCatColor });
      if (resp?.error) {
        Toast.show({
          type: 'error',
          text1: isEditCat ? 'Could not update category' : 'Could not create category',
          text2: resp.error.message || resp.error.data?.message || '',
          position: 'bottom',
        });
        return;
      }
      // Refetch categories so the change is reflected.
      const cats = await fetchPosCategoriesOdoo();
      setPosCategories(cats || []);
      const targetId = isEditCat ? editingCatId : resp.result;
      const updated = (cats || []).find((c) => c.id === targetId)
        || { id: targetId, name: trimmed, color: newCatColor };
      // Preselect the (newly-created or just-edited) category — but only if
      // we're editing the same one currently picked, or creating fresh.
      if (!isEditCat || category?.id === targetId) {
        setCategory({ id: updated.id, name: updated.name, kind: 'pos' });
      }
      setAddCatModalVisible(false);
      setEditingCatId(null);
      setNewCatName('');
      setNewCatColor(0);
      Toast.show({
        type: 'success',
        text1: isEditCat ? 'Category updated' : 'Category created',
        position: 'bottom',
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Save failed', text2: e?.message || '', position: 'bottom' });
    } finally {
      setCreatingCat(false);
    }
  };

  return (
    <SafeAreaView backgroundColor="#F5F6FA">
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.headerBtn}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isEdit ? 'Edit Product' : 'New Product'}</Text>
        {isOpHidden ? (
          <View style={{ width: 40 }} />
        ) : (
          <TouchableOpacity onPress={handleSubmit} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.headerBtn}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
          {/* Image picker */}
          <TouchableOpacity style={s.imagePicker} activeOpacity={0.85} onPress={handlePickImage}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={s.productImage} />
            ) : (
              <View style={s.imagePlaceholder}>
                <MaterialIcons name="add-a-photo" size={32} color={MUTED} />
                <Text style={s.imagePlaceholderText}>Add Image</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={s.formCard}>
            <Field label="Product Name *" value={productName} onChangeText={setProductName} placeholder="Enter product name" />

            <PickerField
              label="Category *"
              value={category?.name || ''}
              placeholder="Select category"
              onPress={() => openPicker('category')}
            />

            <Field label="Sales Price" value={salesPrice} onChangeText={setSalesPrice} placeholder="0.000" keyboardType="numeric" />

            <Field label="Cost" value={cost} onChangeText={setCost} placeholder="0.000" keyboardType="numeric" />

            <PickerField
              label="Unit of Measure"
              value={uom?.name}
              placeholder="Select unit"
              onPress={() => openPicker('uom')}
            />

            <Field label="On Hand Quantity" value={onHandQty} onChangeText={setOnHandQty} placeholder="0" keyboardType="numeric" />

            <Field
              label="Barcode"
              value={barcode}
              onChangeText={setBarcode}
              placeholder="Enter barcode"
              onScanPress={() =>
                navigation.navigate('Scanner', {
                  onScan: (scanned) => {
                    setBarcode(String(scanned || '').trim());
                    navigation.goBack();
                  },
                })
              }
            />

            <Field label="Internal Reference" value={internalRef} onChangeText={setInternalRef} placeholder="e.g. PROD-001" />
          </View>

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={20} color="#fff" />
                <Text style={s.saveBtnText}>{isEdit ? 'Save Changes' : 'Create Product'}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Picker Modal — centered card */}
      <Modal visible={!!pickerOpen} animationType="fade" transparent onRequestClose={closePicker}>
        <TouchableWithoutFeedback onPress={closePicker}>
          <View style={s.pickerBackdrop}>
            <TouchableWithoutFeedback>
              <View style={s.pickerCard}>
                <View style={s.pickerCardHeader}>
                  <Text style={s.pickerHeaderTitle}>{pickerTitle}</Text>
                  <TouchableOpacity
                    onPress={closePicker}
                    style={s.pickerCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="close" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>
                <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 }}>
                  <TextInput
                    style={s.pickerSearch}
                    placeholder="Search…"
                    placeholderTextColor={MUTED}
                    value={pickerSearch}
                    onChangeText={setPickerSearch}
                  />
                </View>
                {pickerOpen === 'category' ? (
                  <>
                    <FlatList
                      data={filteredPosCategories}
                      keyExtractor={(item, idx) => `p-${item.id}-${idx}`}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <View style={s.pickerRowWrap}>
                          <TouchableOpacity
                            style={s.pickerRowMain}
                            activeOpacity={0.7}
                            onPress={() => onPickerSelect(item, 'pos')}
                          >
                            <View style={[s.colorDot, { backgroundColor: ODOO_COLORS[item.color || 0] || '#FFFFFF' }]} />
                            <Text style={s.pickerRowText} numberOfLines={1}>{item.name}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.pickerEditBtn}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => {
                              setEditingCatId(item.id);
                              setNewCatName(item.name || '');
                              setNewCatColor(item.color || 0);
                              setPickerOpen(null);
                              setAddCatModalVisible(true);
                            }}
                          >
                            <MaterialIcons name="edit" size={16} color={NAVY} />
                          </TouchableOpacity>
                        </View>
                      )}
                      ListEmptyComponent={(
                        <View style={{ padding: 24, alignItems: 'center' }}>
                          <Text style={{ color: MUTED }}>No POS categories</Text>
                        </View>
                      )}
                    />
                    <TouchableOpacity
                      style={s.addCatRow}
                      activeOpacity={0.85}
                      onPress={() => {
                        setEditingCatId(null);
                        setNewCatName(pickerSearch || '');
                        setNewCatColor(0);
                        setPickerOpen(null);
                        setAddCatModalVisible(true);
                      }}
                    >
                      <MaterialIcons name="add-circle" size={20} color={NAVY} />
                      <Text style={s.addCatRowText}>Add Category</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <FlatList
                    data={filteredUoms}
                    keyExtractor={(item, idx) => `${item.id}-${idx}`}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity style={s.pickerRow} activeOpacity={0.7} onPress={() => onPickerSelect(item)}>
                        <Text style={s.pickerRowText}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={(
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text style={{ color: MUTED }}>No results</Text>
                      </View>
                    )}
                  />
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* New Category Modal — centered card with name input + colour grid */}
      <Modal
        visible={addCatModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => !creatingCat && setAddCatModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => !creatingCat && setAddCatModalVisible(false)}>
          <View style={s.pickerBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[s.pickerCard, { maxWidth: 420, maxHeight: undefined }]}>
                <View style={s.pickerCardHeader}>
                  <Text style={s.pickerHeaderTitle}>{editingCatId ? 'Edit Category' : 'New Category'}</Text>
                  <TouchableOpacity
                    onPress={() => !creatingCat && setAddCatModalVisible(false)}
                    style={s.pickerCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="close" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>
                <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
                  <Text style={s.fieldLabel}>Category Name *</Text>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="e.g. Soft Drinks"
                    placeholderTextColor="#aaa"
                    value={newCatName}
                    onChangeText={setNewCatName}
                    autoFocus
                  />

                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>Colour</Text>
                  <View style={s.colorGrid}>
                    {ODOO_COLORS.map((hex, idx) => {
                      const selected = newCatColor === idx;
                      const isWhite = idx === 0;
                      return (
                        <TouchableOpacity
                          key={idx}
                          activeOpacity={0.85}
                          onPress={() => setNewCatColor(idx)}
                          style={[
                            s.colorSwatch,
                            { backgroundColor: hex },
                            isWhite && { borderColor: '#cbd5e1', borderWidth: 1.5 },
                            selected && !isWhite && { borderColor: '#1a1a2e', borderWidth: 3 },
                            selected && isWhite && { borderColor: NAVY, borderWidth: 2 },
                          ]}
                        >
                          {selected ? (
                            <MaterialIcons
                              name="check"
                              size={16}
                              color={isWhite ? NAVY : '#fff'}
                            />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={s.addCatActions}>
                  <TouchableOpacity
                    style={s.addCatCancelBtn}
                    activeOpacity={0.7}
                    disabled={creatingCat}
                    onPress={() => setAddCatModalVisible(false)}
                  >
                    <Text style={s.addCatCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.addCatSaveBtn, creatingCat && { opacity: 0.6 }]}
                    activeOpacity={0.85}
                    disabled={creatingCat}
                    onPress={handleSaveNewCategory}
                  >
                    {creatingCat ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={s.addCatSaveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
};

const Field = ({ label, value, onChangeText, placeholder, keyboardType, multiline, onScanPress }) => {
  // Numeric / phone inputs auto-select on tap so the user can overwrite the
  // existing value with a fresh number in one tap.
  const isNumeric = keyboardType === 'numeric' || keyboardType === 'phone-pad' || keyboardType === 'decimal-pad';
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      {onScanPress ? (
        <View style={s.scanRow}>
          <TextInput
            style={[s.fieldInput, { flex: 1 }]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#aaa"
            keyboardType={keyboardType || 'default'}
            selectTextOnFocus={isNumeric}
          />
          <TouchableOpacity
            style={s.scanBtn}
            activeOpacity={0.85}
            onPress={onScanPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="qr-code-scanner" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TextInput
          style={[s.fieldInput, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#aaa"
          keyboardType={keyboardType || 'default'}
          multiline={!!multiline}
          selectTextOnFocus={isNumeric}
        />
      )}
    </View>
  );
};

const PickerField = ({ label, value, placeholder, onPress }) => (
  <View style={s.fieldGroup}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TouchableOpacity style={s.pickerBtn} activeOpacity={0.75} onPress={onPress}>
      <Text style={[s.pickerBtnText, !value && { color: '#aaa' }]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      <MaterialIcons name="arrow-drop-down" size={22} color={MUTED} />
    </TouchableOpacity>
  </View>
);

export default ProductCreationForm;

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: NAVY,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 17,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  headerBtn: {
    fontSize: 15,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
  },

  formContent: { padding: 16, paddingBottom: 60, backgroundColor: '#F5F6FA' },

  imagePicker: { alignItems: 'center', marginVertical: 8 },
  productImage: { width: 130, height: 130, borderRadius: 14, backgroundColor: '#eee' },
  imagePlaceholder: {
    width: 130, height: 130, borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e5e7eb', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  imagePlaceholderText: { fontSize: 12, color: MUTED, marginTop: 4, fontFamily: FONT_FAMILY.urbanistMedium },

  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
  },

  fieldGroup: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 12, color: '#6b7280',
    fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14, color: '#1f2937',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },

  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  pickerBtnText: { fontSize: 14, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistMedium, flex: 1 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORANGE, borderRadius: 12,
    paddingVertical: 16, marginTop: 20, marginBottom: 20, gap: 8,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4 },

  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: Math.min(Dimensions.get('window').height * 0.78, 560),
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 14 },
    }),
  },
  pickerCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#eef0f5',
  },
  pickerCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerHeaderTitle: { fontSize: 16, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.2 },
  pickerSearch: {
    backgroundColor: '#F3F4F6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 14, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistMedium,
  },
  pickerRow: {
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center',
  },
  pickerRowText: { fontSize: 14, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistMedium, flexShrink: 1 },
  // Two-column row used for category list (name on left, edit pencil on right).
  pickerRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  pickerRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  pickerEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eef0f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: '#F5F6FA',
  },
  pickerSectionTitle: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // Picker row colour dot — small swatch matching the POS category's color.
  colorDot: {
    width: 10, height: 10, borderRadius: 5,
    marginRight: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },

  // "+ Add Category" footer inside the picker popup
  addCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8,
  },
  addCatRowText: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  // New-Category modal — name + colour swatches
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCatActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  addCatCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCatCancelText: {
    color: NAVY,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  addCatSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },
  addCatSaveText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
});
