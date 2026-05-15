import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch, FlatList, Dimensions, Platform,
} from 'react-native';
import Modal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import {
  fetchVendors, fetchPurchaseProducts, fetchPaymentMethods, fetchWarehouses,
  fetchPaymentTerms, fetchPurchaseTaxes, createEasyPurchase, confirmEasyPurchase,
} from '@api/services/easyPurchaseApi';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import { FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const today = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const num = (v) => Number(v || 0);
// Render a money value with the Odoo-configured company currency.
const fmt = (v) => formatCurrency(v);

// Reusable picker modal — searchable list of {id, label, sub}
const PickerModal = ({ visible, title, options, onSelect, onClose, searchPlaceholder = 'Search…' }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q) return options;
    const lc = q.toLowerCase();
    return options.filter((o) => (o.label || '').toLowerCase().includes(lc));
  }, [q, options]);
  return (
    <Modal
      isVisible={visible}
      animationIn="zoomIn"
      animationOut="zoomOut"
      backdropOpacity={0.4}
      animationInTiming={250}
      animationOutTiming={200}
      backdropTransitionInTiming={250}
      backdropTransitionOutTiming={200}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={styles.modalCenter}
    >
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <MaterialIcons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor="#999"
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(it, idx) => `pick-${it.id}-${idx}`}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.pickerRow} onPress={() => { onSelect(item); onClose(); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerLabel}>{item.label}</Text>
                {item.sub ? <Text style={styles.pickerSub}>{item.sub}</Text> : null}
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={(
            <Text style={styles.emptyPicker}>No matches</Text>
          )}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Modal>
  );
};

// Inline line-item editor (used by both Add and Edit)
const LineEditor = ({ visible, line, taxes, onSave, onClose, onPickProduct }) => {
  const [draft, setDraft] = useState(line || {});
  useEffect(() => { setDraft(line || {}); }, [line, visible]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const subtotal = useMemo(() => {
    const qty = num(draft.quantity);
    const price = num(draft.price_unit);
    const disc = num(draft.discount);
    const eff = draft.discount_type === 'amount' ? price - disc : price * (1 - disc / 100);
    return Math.max(0, eff) * qty;
  }, [draft.quantity, draft.price_unit, draft.discount, draft.discount_type]);

  return (
    <Modal
      isVisible={visible}
      animationIn="zoomIn"
      animationOut="zoomOut"
      backdropOpacity={0.4}
      animationInTiming={250}
      animationOutTiming={200}
      backdropTransitionInTiming={250}
      backdropTransitionOutTiming={200}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={styles.modalCenterWide}
      avoidKeyboard
    >
      <View style={[styles.modalCard, styles.modalCardWide]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{draft.id ? 'Edit Line' : 'Add Line'}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <MaterialIcons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Text style={styles.label}>Product *</Text>
            <TouchableOpacity style={styles.picker} onPress={onPickProduct}>
              <Text style={styles.pickerValue}>{draft.product_name || 'Select a product'}</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
            </TouchableOpacity>

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional"
              placeholderTextColor="#999"
              value={draft.description || ''}
              onChangeText={(v) => set('description', v)}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Quantity *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor="#999"
                  value={String(draft.quantity ?? '')}
                  onChangeText={(v) => set('quantity', v)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Unit Price *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0.000"
                  placeholderTextColor="#999"
                  value={String(draft.price_unit ?? '')}
                  onChangeText={(v) => set('price_unit', v)}
                />
              </View>
            </View>

            <Text style={styles.label}>Discount ({draft.discount_type === 'amount' ? 'amount' : '%'})</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#999"
              value={String(draft.discount ?? '')}
              onChangeText={(v) => set('discount', v)}
            />

            <Text style={styles.label}>Taxes</Text>
            <View style={styles.taxWrap}>
              {taxes.length === 0 ? (
                <Text style={styles.metaText}>No purchase taxes available</Text>
              ) : taxes.map((t) => {
                const selected = (draft.tax_ids || []).includes(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.taxChip, selected && styles.taxChipActive]}
                    onPress={() => {
                      const cur = draft.tax_ids || [];
                      const next = selected ? cur.filter((x) => x !== t.id) : [...cur, t.id];
                      set('tax_ids', next);
                    }}
                  >
                    <Text style={[styles.taxChipText, selected && { color: '#fff' }]}>
                      {t.name} {t.amount ? `(${t.amount}${t.amount_type === 'percent' ? '%' : ''})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.subtotalBox}>
              <Text style={styles.subtotalLabel}>Subtotal (excl. tax)</Text>
              <Text style={styles.subtotalValue}>{fmt(subtotal)}</Text>
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
              onPress={() => {
                if (!draft.product_id) return showToastMessage('Pick a product');
                if (!draft.quantity || num(draft.quantity) <= 0) return showToastMessage('Enter a quantity');
                // Compute tax_amount and total so the line row can display them
                // without re-doing the math each render.
                const taxPercent = (draft.tax_ids || []).reduce((acc, tid) => {
                  const t = (taxes || []).find((x) => x.id === tid);
                  if (t && t.amount_type === 'percent') return acc + num(t.amount);
                  return acc;
                }, 0);
                const tax_amount = subtotal * taxPercent / 100;
                const total = subtotal + tax_amount;
                onSave({ ...draft, subtotal, tax_amount, total });
              }}
            >
              <Text style={styles.btnPrimaryText}>{draft.id ? 'Save' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
      </View>
    </Modal>
  );
};

const EasyPurchaseFormScreen = ({ navigation }) => {
  // Subscribe so the screen re-renders when the currency hydrates / changes.
  useAuthStore((s) => s.currency);
  // Header
  const [date, setDate] = useState(today());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [vendor, setVendor] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentTerm, setPaymentTerm] = useState(null);
  const [warehouse, setWarehouse] = useState(null);
  const [discountType, setDiscountType] = useState('percentage');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [autoValidateBill, setAutoValidateBill] = useState(true);
  const [autoRegisterPayment, setAutoRegisterPayment] = useState(true);

  // Lines
  const [lines, setLines] = useState([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingLine, setEditingLine] = useState(null);

  // Picker option sources
  const [vendorOptions, setVendorOptions] = useState([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState([]);
  const [paymentTermOptions, setPaymentTermOptions] = useState([]);
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [taxOptions, setTaxOptions] = useState([]);

  // Picker visibility
  const [vendorPickerVisible, setVendorPickerVisible] = useState(false);
  const [pmPickerVisible, setPmPickerVisible] = useState(false);
  const [ptPickerVisible, setPtPickerVisible] = useState(false);
  const [whPickerVisible, setWhPickerVisible] = useState(false);
  const [productPickerVisible, setProductPickerVisible] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [pms, whs, terms, taxes] = await Promise.all([
          fetchPaymentMethods({ active: true }),
          fetchWarehouses(),
          fetchPaymentTerms(),
          fetchPurchaseTaxes(),
        ]);
        setPaymentMethodOptions((pms || []).map((p) => ({
          id: p.id,
          label: p.name,
          sub: p.is_vendor_account ? 'Credit (Vendor Account)' : (p.journal_id?.[1] || ''),
          raw: p,
        })));
        const def = (pms || []).find((p) => p.is_default);
        if (def) setPaymentMethod({ id: def.id, label: def.name, raw: def });

        setWarehouseOptions((whs || []).map((w) => ({ id: w.id, label: w.name, sub: w.code, raw: w })));
        if ((whs || []).length === 1) setWarehouse({ id: whs[0].id, label: whs[0].name, raw: whs[0] });

        setPaymentTermOptions((terms || []).map((t) => ({ id: t.id, label: t.name })));
        setTaxOptions(taxes || []);
      } catch (e) {
        console.error('[EasyPurchaseForm] bootstrap', e);
        showToastMessage(e?.message || 'Failed to load form options');
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  const isCredit = paymentMethod?.raw?.is_vendor_account;

  // Search-on-demand for vendors and products
  const openVendorPicker = async () => {
    try {
      const rows = await fetchVendors({ limit: 50 });
      setVendorOptions((rows || []).map((v) => ({
        id: v.id, label: v.name, sub: v.email || v.phone || '', raw: v,
      })));
      setVendorPickerVisible(true);
    } catch (e) { showToastMessage(e?.message || 'Failed to load vendors'); }
  };
  const openProductPicker = async () => {
    try {
      const rows = await fetchPurchaseProducts({ limit: 50 });
      setProductOptions((rows || []).map((p) => ({
        id: p.id, label: p.display_name || p.name,
        sub: p.default_code ? `[${p.default_code}]` : '',
        raw: p,
      })));
      setProductPickerVisible(true);
    } catch (e) { showToastMessage(e?.message || 'Failed to load products'); }
  };

  // Lines section is locked until vendor + payment method are set,
  // matching the Odoo `easy_purchase` module's flow.
  const linesEnabled = !!vendor && !!paymentMethod;

  // Totals
  const totals = useMemo(() => {
    let untaxed = 0; let tax = 0;
    for (const l of lines) {
      const qty = num(l.quantity);
      const price = num(l.price_unit);
      const disc = num(l.discount);
      const eff = discountType === 'amount' ? price - disc : price * (1 - disc / 100);
      const sub = Math.max(0, eff) * qty;
      untaxed += sub;
      // tax: rough client-side calc using percent taxes only
      const taxPercent = (l.tax_ids || []).reduce((acc, tid) => {
        const t = taxOptions.find((x) => x.id === tid);
        if (t && t.amount_type === 'percent') return acc + num(t.amount);
        return acc;
      }, 0);
      tax += sub * taxPercent / 100;
    }
    return { untaxed, tax, total: untaxed + tax };
  }, [lines, discountType, taxOptions]);

  const onSaveLine = (draft) => {
    setLines((cur) => {
      if (draft.id) return cur.map((l) => l.id === draft.id ? draft : l);
      return [...cur, { ...draft, id: `tmp-${Date.now()}` }];
    });
    setEditorVisible(false);
    setEditingLine(null);
  };

  const onRemoveLine = (id) =>
    setLines((cur) => cur.filter((l) => l.id !== id));

  // Build the create payload from current form state.
  const buildPayload = () => ({
    date,
    partner_id: vendor.id,
    payment_method_id: paymentMethod.id,
    warehouse_id: warehouse.id,
    discount_type: discountType,
    reference: reference || false,
    notes: notes || false,
    auto_validate_bill: !!autoValidateBill,
    auto_register_payment: !!autoRegisterPayment,
    ...(isCredit && paymentTerm ? { payment_term_id: paymentTerm.id } : {}),
    lines: lines.map((l) => ({
      product_id: l.product_id,
      description: l.description || l.product_name,
      quantity: num(l.quantity),
      price_unit: num(l.price_unit),
      discount: num(l.discount),
      tax_ids: l.tax_ids || [],
    })),
  });

  const validateForm = () => {
    if (!vendor) { showToastMessage('Select a vendor'); return false; }
    if (!paymentMethod) { showToastMessage('Select a payment method'); return false; }
    if (!warehouse) { showToastMessage('Select a warehouse'); return false; }
    if (!lines.length) { showToastMessage('Add at least one product line'); return false; }
    return true;
  };

  // Save = create as draft, leave it unconfirmed. The user can come back
  // later via EasyPurchase list and confirm/edit.
  const saveAsDraft = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const id = await createEasyPurchase(buildPayload());
      showToastMessage('Saved as draft');
      navigation.replace('EasyPurchaseDetail', { id });
    } catch (e) {
      console.error('[EasyPurchaseForm] saveAsDraft', e);
      showToastMessage(e?.message || 'Failed to save draft');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit = create AND confirm in one shot (existing behaviour).
  const submit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const id = await createEasyPurchase(buildPayload());
      await confirmEasyPurchase(id);
      showToastMessage('Purchase confirmed');
      navigation.replace('EasyPurchaseDetail', { id });
    } catch (e) {
      console.error('[EasyPurchaseForm] submit', e);
      showToastMessage(e?.message || 'Failed to create purchase');
    } finally {
      setSubmitting(false);
    }
  };

  if (bootstrapping) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="New Purchase" onBackPress={() => navigation.goBack()} />
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="New Purchase" onBackPress={() => navigation.goBack()} />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 12, paddingBottom: 140 }}>
        {/* Header card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Purchase Header</Text>

          <Text style={styles.label}>Vendor *</Text>
          <TouchableOpacity style={styles.picker} onPress={openVendorPicker}>
            <Text style={styles.pickerValue}>{vendor?.label || 'Select vendor'}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
          </TouchableOpacity>

          <Text style={styles.label}>Date *</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.pickerValue}>{date}</Text>
            <MaterialIcons name="event" size={20} color="#666" />
          </TouchableOpacity>

          <Text style={styles.label}>Vendor Reference</Text>
          <TextInput
            style={styles.input}
            placeholder="Optional reference"
            placeholderTextColor="#999"
            value={reference}
            onChangeText={setReference}
          />

          <Text style={styles.label}>Discount Type</Text>
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentBtn, discountType === 'percentage' && styles.segmentActive]}
              onPress={() => setDiscountType('percentage')}
            >
              <Text style={[styles.segmentText, discountType === 'percentage' && styles.segmentTextActive]}>Percentage</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, discountType === 'amount' && styles.segmentActive]}
              onPress={() => setDiscountType('amount')}
            >
              <Text style={[styles.segmentText, discountType === 'amount' && styles.segmentTextActive]}>Amount</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment / Warehouse card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment & Warehouse</Text>

          <Text style={styles.label}>Payment Method *</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setPmPickerVisible(true)}>
            <Text style={styles.pickerValue}>{paymentMethod?.label || 'Select payment method'}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
          </TouchableOpacity>

          {isCredit ? (
            <>
              <Text style={styles.label}>Payment Terms</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setPtPickerVisible(true)}>
                <Text style={styles.pickerValue}>{paymentTerm?.label || 'Select payment terms'}</Text>
                <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
              </TouchableOpacity>
            </>
          ) : null}

          <Text style={styles.label}>Warehouse *</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setWhPickerVisible(true)}>
            <Text style={styles.pickerValue}>{warehouse?.label || 'Select warehouse'}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
          </TouchableOpacity>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Auto-Post Bill</Text>
            <Switch value={autoValidateBill} onValueChange={setAutoValidateBill} trackColor={{ true: ORANGE }} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Auto-Register Payment</Text>
            <Switch value={autoRegisterPayment} onValueChange={setAutoRegisterPayment} trackColor={{ true: ORANGE }} />
          </View>
        </View>

        {/* Lines card — locked until vendor + payment method are set */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.sectionTitle}>Product Lines</Text>
            <TouchableOpacity
              style={[styles.addLineBtn, !linesEnabled && styles.addLineBtnDisabled]}
              disabled={!linesEnabled}
              onPress={() => { setEditingLine({ discount_type: discountType }); setEditorVisible(true); }}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text style={styles.addLineText}>Add Line</Text>
            </TouchableOpacity>
          </View>

          {!linesEnabled ? (
            <View style={styles.lockHint}>
              <MaterialIcons name="lock-outline" size={16} color="#b45309" />
              <Text style={styles.lockHintText}>
                Select a vendor and a payment method first to start adding products.
              </Text>
            </View>
          ) : null}

          {lines.length === 0 ? (
            <Text style={styles.metaText}>
              {linesEnabled
                ? 'No lines yet. Tap "Add Line" to add a product.'
                : 'No products can be added yet.'}
            </Text>
          ) : lines.map((l) => {
            const subtotal = l.subtotal != null ? l.subtotal : num(l.quantity) * num(l.price_unit);
            const total = l.total != null ? l.total : subtotal + num(l.tax_amount);
            const lineTaxes = (l.tax_ids || []).map((tid) => taxOptions.find((t) => t.id === tid)).filter(Boolean);
            return (
              <View
                key={l.id}
                style={[styles.lineCard, !linesEnabled && { opacity: 0.5 }]}
              >
                {/* Top row: name + description + actions */}
                <View style={styles.lineTopRow}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={0.7}
                    disabled={!linesEnabled}
                    onPress={() => { setEditingLine({ ...l, discount_type: discountType }); setEditorVisible(true); }}
                  >
                    <Text style={styles.lineName} numberOfLines={1}>{l.product_name || 'Product'}</Text>
                    {l.description && l.description !== l.product_name ? (
                      <Text style={styles.lineDesc} numberOfLines={1}>{l.description}</Text>
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('BarcodePrint', {
                      prefill: {
                        productId: l.product_id,
                        productName: l.product_name || '',
                        productCode: l.product_code || '',
                        productBarcode: l.product_barcode || '',
                        quantity: Math.max(1, parseInt(num(l.quantity), 10) || 1),
                        retailPrice: l.lst_price ?? l.price_unit ?? 0,
                        wholesalePrice: l.standard_price ?? l.price_unit ?? 0,
                      },
                    })}
                    style={styles.linePrintBtn}
                  >
                    <MaterialIcons name="qr-code-2" size={16} color="#fff" />
                    <Text style={styles.linePrintText}>Print</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRemoveLine(l.id)}
                    disabled={!linesEnabled}
                    style={styles.lineDeleteBtn}
                  >
                    <MaterialIcons name="delete-outline" size={20} color={linesEnabled ? '#dc2626' : '#fca5a5'} />
                  </TouchableOpacity>
                </View>

                {/* Column grid: Qty / Unit / Discount / Subtotal / Total */}
                <View style={styles.lineGrid}>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Qty</Text>
                    <Text style={styles.lineCellValue}>{num(l.quantity).toFixed(2)}</Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Unit</Text>
                    <Text style={styles.lineCellValue}>{fmt(l.price_unit)}</Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Discount</Text>
                    <Text style={styles.lineCellValue}>
                      {num(l.discount).toFixed(2)}{discountType === 'percentage' ? '%' : ''}
                    </Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Subtotal</Text>
                    <Text style={styles.lineCellValue}>{fmt(subtotal)}</Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Total</Text>
                    <Text style={[styles.lineCellValue, styles.lineCellTotal]}>{fmt(total)}</Text>
                  </View>
                </View>

                {/* Tax chips */}
                {lineTaxes.length > 0 ? (
                  <View style={styles.lineTaxRow}>
                    <Text style={styles.lineCellLabel}>Taxes</Text>
                    <View style={styles.lineTaxChips}>
                      {lineTaxes.map((t) => (
                        <View key={t.id} style={styles.lineTaxChip}>
                          <Text style={styles.lineTaxChipText}>
                            {t.amount_type === 'percent' ? `${t.amount}%` : t.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Internal notes (optional)"
            placeholderTextColor="#999"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {/* Totals */}
        <View style={[styles.card, { backgroundColor: NAVY }]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelDark}>Untaxed</Text>
            <Text style={styles.totalValueDark}>{fmt(totals.untaxed)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelDark}>Taxes</Text>
            <Text style={styles.totalValueDark}>{fmt(totals.tax)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 8, marginTop: 8 }]}>
            <Text style={styles.totalLabelDarkBold}>Total</Text>
            <Text style={styles.totalValueDarkBold}>{fmt(totals.total)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action bar — Save (creates as draft, no confirm) + Confirm Purchase
          (existing behaviour: create + confirm in one go). */}
      <View style={[styles.bottomBar, { flexDirection: 'row', gap: 8 }]}>
        <FeatureGate featureKey="easy_purchase.save">
          <TouchableOpacity
            style={[
              styles.btn,
              { flex: 1, backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
              submitting && { opacity: 0.6 },
            ]}
            disabled={submitting}
            onPress={saveAsDraft}
          >
            <MaterialIcons name="save" size={20} color="#fff" />
            <Text style={styles.btnConfirmText}>Save</Text>
          </TouchableOpacity>
        </FeatureGate>
        <FeatureGate featureKey="easy_purchase.save">
          <TouchableOpacity
            style={[styles.btn, styles.btnConfirm, { flex: 1.2 }, submitting && { opacity: 0.6 }]}
            disabled={submitting}
            onPress={submit}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialIcons name="check-circle" size={20} color="#fff" />
                <Text style={styles.btnConfirmText}>Confirm Purchase</Text>
              </>
            )}
          </TouchableOpacity>
        </FeatureGate>
      </View>

      {/* Pickers */}
      <PickerModal
        visible={vendorPickerVisible}
        title="Select Vendor"
        options={vendorOptions}
        onSelect={(v) => setVendor(v)}
        onClose={() => setVendorPickerVisible(false)}
      />
      <PickerModal
        visible={pmPickerVisible}
        title="Payment Method"
        options={paymentMethodOptions}
        onSelect={(v) => { setPaymentMethod(v); if (!v?.raw?.is_vendor_account) setPaymentTerm(null); }}
        onClose={() => setPmPickerVisible(false)}
      />
      <PickerModal
        visible={ptPickerVisible}
        title="Payment Terms"
        options={paymentTermOptions}
        onSelect={(v) => setPaymentTerm(v)}
        onClose={() => setPtPickerVisible(false)}
      />
      <PickerModal
        visible={whPickerVisible}
        title="Warehouse"
        options={warehouseOptions}
        onSelect={(v) => setWarehouse(v)}
        onClose={() => setWhPickerVisible(false)}
      />
      <PickerModal
        visible={productPickerVisible}
        title="Select Product"
        options={productOptions}
        onSelect={(p) => {
          const r = p.raw || {};
          setEditingLine((cur) => ({
            ...cur,
            product_id: r.id,
            product_name: r.display_name || r.name,
            description: r.display_name || r.name,
            uom_id: Array.isArray(r.uom_id) ? r.uom_id[0] : r.uom_id || false,
            price_unit: r.standard_price ?? cur?.price_unit ?? 0,
            tax_ids: cur?.tax_ids?.length ? cur.tax_ids : (r.supplier_taxes_id || []),
            quantity: cur?.quantity || 1,
            // Stash extra fields used by per-line Print (BarcodePrintScreen prefill)
            product_code: r.default_code || '',
            product_barcode: r.barcode || '',
            lst_price: r.lst_price ?? 0,
            standard_price: r.standard_price ?? 0,
          }));
        }}
        onClose={() => setProductPickerVisible(false)}
      />

      <LineEditor
        visible={editorVisible}
        line={editingLine}
        taxes={taxOptions}
        onPickProduct={openProductPicker}
        onSave={onSaveLine}
        onClose={() => { setEditorVisible(false); setEditingLine(null); }}
      />

      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        onConfirm={(d) => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          setDate(`${yyyy}-${mm}-${dd}`);
          setShowDatePicker(false);
        }}
        onCancel={() => setShowDatePicker(false)}
      />
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
  metaText: { fontSize: 12, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 6 },

  segment: { flexDirection: 'row', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  segmentActive: { backgroundColor: NAVY },
  segmentText: { fontSize: 13, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold },
  segmentTextActive: { color: '#fff' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6', marginTop: 6,
  },
  toggleLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#374151' },

  addLineBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: ORANGE,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, gap: 4,
  },
  addLineBtnDisabled: { opacity: 0.4 },
  addLineText: { color: '#fff', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },
  lockHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa',
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, marginTop: 10,
  },
  lockHintText: {
    flex: 1, marginLeft: 6,
    fontSize: 12, color: '#9a3412', fontFamily: FONT_FAMILY.urbanistSemiBold, lineHeight: 16,
  },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8f9fc', borderRadius: 10, padding: 10, marginTop: 8,
  },
  lineName: { fontSize: 13, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  lineMeta: { fontSize: 11, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2 },
  lineAmt: { fontSize: 13, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 8 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabelDark: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: FONT_FAMILY.urbanistSemiBold },
  totalValueDark: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },
  totalLabelDarkBold: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },
  totalValueDarkBold: { color: '#fff', fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  btn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnPrimary: { backgroundColor: NAVY },
  btnPrimaryText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14 },
  btnGhost: { backgroundColor: '#f3f4f6', paddingHorizontal: 18 },
  btnGhostText: { color: '#374151', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14 },
  btnConfirm: {
    backgroundColor: ORANGE, paddingVertical: 14,
    shadowColor: ORANGE, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  btnConfirmText: { color: '#fff', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },

  // Line card (Odoo-style columns + Print)
  lineCard: {
    backgroundColor: '#f8f9fc',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#eef0f5',
  },
  lineTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  lineDesc: { fontSize: 11, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2 },
  linePrintBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    marginLeft: 8,
  },
  linePrintText: { color: '#fff', fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 2 },
  lineDeleteBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  lineGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  lineCell: { width: '33.333%', paddingVertical: 4 },
  lineCellLabel: {
    fontSize: 10, color: '#8896ab', fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  lineCellValue: { fontSize: 13, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, marginTop: 2 },
  lineCellTotal: { color: ORANGE },
  lineTaxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  lineTaxChips: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginLeft: 8 },
  lineTaxChip: {
    backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    marginRight: 6, marginBottom: 4,
  },
  lineTaxChipText: { fontSize: 10, color: '#9a3412', fontFamily: FONT_FAMILY.urbanistBold },

  // Modal/picker — center popup style (matches employee_attendance CustomListModal)
  modalCenter: { margin: 24, justifyContent: 'center', alignItems: 'center' },
  // Wider variant for the LineEditor (form has side-by-side fields, needs breathing room).
  // Drop `alignItems: 'center'` so the inner card honors `width: '100%'` instead of
  // shrinking to its content. `marginHorizontal: 0` lets the card span (almost) edge-to-edge.
  modalCenterWide: { marginHorizontal: 12, marginVertical: 24, justifyContent: 'center' },
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
  // LineEditor card: wider + taller, since it holds a full mini-form
  modalCardWide: {
    width: Dimensions.get('window').width - 24,
    maxWidth: 720,
    maxHeight: Dimensions.get('window').height * 0.92,
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

  taxWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  taxChip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  taxChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  taxChipText: { fontSize: 11, color: '#374151', fontFamily: FONT_FAMILY.urbanistSemiBold },
  subtotalBox: {
    marginTop: 14, padding: 12, backgroundColor: '#f8f9fc',
    borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  subtotalLabel: { fontSize: 13, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold },
  subtotalValue: { fontSize: 16, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
});

export default EasyPurchaseFormScreen;
