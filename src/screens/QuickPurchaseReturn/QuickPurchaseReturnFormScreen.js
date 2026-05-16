// QuickPurchaseReturnFormScreen — Odoo's `quick.purchase.return.app` form
// in React Native. The flow:
//   1. Cashier picks a posted Vendor Bill from a searchable modal.
//   2. We create a draft return on the server with that source_invoice_id.
//      The model's onchange auto-loads line_ids from the bill.
//   3. We re-fetch the detail and show one row per returnable line, with
//      editable Return Qty (max = returnable_qty).
//   4. Toggle Auto-Post / Auto-Validate, set Warehouse, write Notes.
//   5. Confirm → server creates Credit Note + Return Picking; we navigate
//      to the Detail screen.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  Modal, FlatList, ActivityIndicator, Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import {
  fetchReturnableVendorBills,
  createQuickReturn,
  fetchQuickReturnDetail,
  updateQuickReturn,
  updateReturnLineQty,
  confirmQuickReturn,
  returnFullQuantity,
} from '@api/services/quickPurchaseReturnApi';
import { fetchWarehouses } from '@api/services/easyPurchaseApi';

const NAVY = COLORS.primaryThemeColor;
const RED = '#B91C1C';

const QuickPurchaseReturnFormScreen = ({ navigation }) => {
  const currency = useAuthStore((s) => s.currency);

  // Server-side draft id — created the moment a vendor bill is picked so the
  // model's onchange can auto-load line_ids on the backend.
  const [draftId, setDraftId] = useState(null);
  const [bill, setBill] = useState(null);           // selected vendor bill (account.move row)
  const [lines, setLines] = useState([]);            // quick.purchase.return.line.app rows
  const [autoPost, setAutoPost] = useState(true);
  const [autoValidate, setAutoValidate] = useState(true);
  const [warehouse, setWarehouse] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [notes, setNotes] = useState('');

  const [billPickerVisible, setBillPickerVisible] = useState(false);
  const [billSearch, setBillSearch] = useState('');
  const [billOptions, setBillOptions] = useState([]);
  const [billLoading, setBillLoading] = useState(false);
  const [whPickerVisible, setWhPickerVisible] = useState(false);

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Initial warehouse load.
  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchWarehouses();
        const list = Array.isArray(rows) ? rows : [];
        setWarehouses(list);
        if (list.length > 0) setWarehouse(list[0]);
      } catch (e) {
        console.warn('[QuickReturnForm] warehouses load failed:', e?.message);
      }
    })();
  }, []);

  // Re-load bill options whenever the picker opens or the search changes.
  const loadBills = useCallback(async (searchText) => {
    setBillLoading(true);
    try {
      const rows = await fetchReturnableVendorBills({ searchText, limit: 30 });
      setBillOptions(Array.isArray(rows) ? rows : []);
    } catch (e) {
      showToastMessage(e?.message || 'Failed to load vendor bills');
    } finally {
      setBillLoading(false);
    }
  }, []);

  useEffect(() => {
    if (billPickerVisible) loadBills(billSearch);
  }, [billPickerVisible, billSearch, loadBills]);

  // When a bill is picked, create the draft return on the server (or update
  // the existing draft) so Odoo's onchange triggers and the line_ids are
  // generated from the bill's invoice_line_ids. Then re-fetch detail.
  const handlePickBill = async (b) => {
    setBillPickerVisible(false);
    setBill(b);
    setBusy(true);
    try {
      let id = draftId;
      if (id == null) {
        id = await createQuickReturn({
          source_invoice_id: b.id,
          warehouse_id: warehouse?.id,
          auto_post_credit_note: autoPost,
          auto_validate_picking: autoValidate,
          notes: notes || '',
        });
        setDraftId(id);
      } else {
        await updateQuickReturn(id, { source_invoice_id: b.id });
      }
      const detail = await fetchQuickReturnDetail(id);
      setLines(detail?.lines || []);
      if (detail?.lines?.length === 0) {
        showToastMessage('No returnable products on this bill');
      }
    } catch (e) {
      console.error('[QuickReturnForm] pickBill error:', e);
      showToastMessage(e?.message || 'Could not load lines from this bill');
    } finally {
      setBusy(false);
    }
  };

  const handleReturnAll = async () => {
    if (!draftId) return;
    setBusy(true);
    try {
      await returnFullQuantity(draftId);
      const detail = await fetchQuickReturnDetail(draftId);
      setLines(detail?.lines || []);
    } catch (e) {
      showToastMessage(e?.message || 'Could not set return-all quantities');
    } finally {
      setBusy(false);
    }
  };

  const handleLineQtyChange = (lineId, raw) => {
    const v = raw.replace(/[^0-9.]/g, '');
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, return_qty: v } : l)));
  };

  // Push the entered return_qty back to the server line. Called on blur so
  // we don't fire a write per keystroke.
  const handleLineQtyBlur = async (line) => {
    if (!line?.id) return;
    const requested = Math.max(0, Math.min(Number(line.return_qty) || 0, Number(line.returnable_qty) || 0));
    try {
      await updateReturnLineQty(line.id, requested);
      if (requested !== Number(line.return_qty)) {
        // Clamp shown value if the user typed over the max.
        setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, return_qty: requested } : l)));
      }
    } catch (e) {
      showToastMessage(e?.message || 'Could not save line qty');
    }
  };

  const handleSaveDraft = async () => {
    if (!draftId) return;
    setBusy(true);
    try {
      await updateQuickReturn(draftId, {
        warehouse_id: warehouse?.id,
        auto_post_credit_note: autoPost,
        auto_validate_picking: autoValidate,
        notes: notes || '',
      });
      showToastMessage('Draft saved');
    } catch (e) {
      showToastMessage(e?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!draftId) {
      showToastMessage('Pick a vendor bill first');
      return;
    }
    const hasQty = lines.some((l) => Number(l.return_qty) > 0);
    if (!hasQty) {
      showToastMessage('Enter at least one return quantity');
      return;
    }
    setConfirming(true);
    try {
      // Persist any in-memory edits first.
      for (const l of lines) {
        if (l.id != null) {
          await updateReturnLineQty(l.id, Math.max(0, Math.min(Number(l.return_qty) || 0, Number(l.returnable_qty) || 0)));
        }
      }
      await updateQuickReturn(draftId, {
        warehouse_id: warehouse?.id,
        auto_post_credit_note: autoPost,
        auto_validate_picking: autoValidate,
        notes: notes || '',
      });
      await confirmQuickReturn(draftId);
      showToastMessage('Return confirmed');
      navigation.replace('QuickPurchaseReturnDetail', { id: draftId });
    } catch (e) {
      console.error('[QuickReturnForm] confirm error:', e);
      showToastMessage(e?.odoo?.data?.message || e?.message || 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  };

  const totalReturn = lines.reduce((s, l) => s + Number(l.total || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title="New Quick Return" onBackPress={() => navigation.goBack()} logo={false} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
        {/* Vendor Bill picker */}
        <Text style={styles.sectionLabel}>VENDOR BILL</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.pickerField}
          onPress={() => setBillPickerVisible(true)}
        >
          <MaterialIcons name="receipt-long" size={20} color={NAVY} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            {bill ? (
              <>
                <Text style={styles.pickerValue} numberOfLines={1}>{bill.name}</Text>
                <Text style={styles.pickerSub} numberOfLines={1}>
                  {(Array.isArray(bill.partner_id) ? bill.partner_id[1] : '—')}
                  {bill.invoice_date ? ` · ${bill.invoice_date}` : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.pickerPlaceholder}>Tap to pick a posted vendor bill</Text>
            )}
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
        </TouchableOpacity>

        {/* Lines */}
        {lines.length > 0 ? (
          <View style={styles.linesCard}>
            <View style={styles.linesHeaderRow}>
              <Text style={styles.linesTitle}>{`${lines.length} line${lines.length === 1 ? '' : 's'}`}</Text>
              <TouchableOpacity onPress={handleReturnAll} disabled={busy} style={styles.returnAllBtn}>
                <MaterialIcons name="select-all" size={14} color="#fff" />
                <Text style={styles.returnAllBtnText}>Return all</Text>
              </TouchableOpacity>
            </View>
            {lines.map((l) => {
              const prodName = Array.isArray(l.product_id) ? l.product_id[1] : (l.description || '—');
              const diff = (Number(l.returnable_qty) || 0) - (Number(l.return_qty) || 0);
              return (
                <View key={l.id} style={styles.lineRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.lineProduct} numberOfLines={2}>{prodName}</Text>
                    <Text style={styles.lineMeta}>
                      {`Purchased ${l.purchased_qty || 0}  ·  Already returned ${l.already_returned_qty || 0}  ·  Max ${l.returnable_qty || 0}`}
                    </Text>
                    <Text style={styles.linePrice}>
                      {`@ ${formatCurrency(Number(l.price_unit) || 0, currency)}  =  ${formatCurrency(Number(l.total) || 0, currency)}`}
                    </Text>
                  </View>
                  <View style={styles.qtyCol}>
                    <Text style={styles.qtyLabel}>RETURN QTY</Text>
                    <TextInput
                      style={styles.qtyInput}
                      value={String(l.return_qty ?? '')}
                      onChangeText={(v) => handleLineQtyChange(l.id, v)}
                      onBlur={() => handleLineQtyBlur(l)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                    />
                    <Text style={[styles.qtyMax, diff < 0 && styles.qtyMaxBad]}>
                      {`max ${l.returnable_qty || 0}`}
                    </Text>
                  </View>
                </View>
              );
            })}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total to refund</Text>
              <Text style={styles.totalsValue}>{formatCurrency(totalReturn, currency)}</Text>
            </View>
          </View>
        ) : bill ? (
          <View style={styles.linesEmpty}>
            <Text style={styles.linesEmptyText}>
              {busy ? 'Loading lines…' : 'No returnable lines on this bill.'}
            </Text>
          </View>
        ) : null}

        {/* Settings */}
        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <View style={styles.settingsCard}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Auto-post Credit Note</Text>
              <Text style={styles.toggleSub}>Post the vendor credit note immediately on confirm.</Text>
            </View>
            <Switch
              value={autoPost}
              onValueChange={setAutoPost}
              trackColor={{ true: NAVY, false: '#cbd5e1' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Auto-validate Return Picking</Text>
              <Text style={styles.toggleSub}>Validate the return stock picking automatically.</Text>
            </View>
            <Switch
              value={autoValidate}
              onValueChange={setAutoValidate}
              trackColor={{ true: NAVY, false: '#cbd5e1' }}
              thumbColor="#fff"
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.warehouseField}
            onPress={() => setWhPickerVisible(true)}
          >
            <MaterialIcons name="warehouse" size={18} color={NAVY} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.toggleLabel}>Warehouse</Text>
              <Text style={styles.pickerSub} numberOfLines={1}>
                {warehouse?.name || 'Pick a warehouse'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Notes */}
        <Text style={styles.sectionLabel}>NOTES</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholder="Optional notes about this return…"
          placeholderTextColor="#9ca3af"
        />
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerBtnGhost]}
          activeOpacity={0.85}
          onPress={handleSaveDraft}
          disabled={busy || confirming || !draftId}
        >
          <Text style={styles.footerBtnGhostText}>Save Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerBtnPrimary, (confirming || !draftId) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          onPress={handleConfirm}
          disabled={busy || confirming || !draftId}
        >
          {confirming ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.footerBtnPrimaryText}>Confirm Return</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Bill picker modal */}
      <Modal visible={billPickerVisible} animationType="slide" transparent
             onRequestClose={() => setBillPickerVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick Vendor Bill</Text>
              <TouchableOpacity onPress={() => setBillPickerVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchRow}>
              <MaterialIcons name="search" size={18} color="#6b7280" />
              <TextInput
                style={styles.modalSearchInput}
                value={billSearch}
                onChangeText={setBillSearch}
                placeholder="Search by bill number…"
                placeholderTextColor="#9ca3af"
              />
            </View>
            {billLoading ? (
              <ActivityIndicator size="large" color={NAVY} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={billOptions}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.billRow} activeOpacity={0.85} onPress={() => handlePickBill(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.billSub} numberOfLines={1}>
                        {(Array.isArray(item.partner_id) ? item.partner_id[1] : '—')}
                        {item.invoice_date ? ` · ${item.invoice_date}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.billAmount}>{formatCurrency(Number(item.amount_total) || 0, currency)}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.modalEmpty}>No posted vendor bills found.</Text>}
                style={{ maxHeight: 420 }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Warehouse picker modal */}
      <Modal visible={whPickerVisible} animationType="slide" transparent
             onRequestClose={() => setWhPickerVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick Warehouse</Text>
              <TouchableOpacity onPress={() => setWhPickerVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={warehouses}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.billRow}
                  activeOpacity={0.85}
                  onPress={() => { setWarehouse(item); setWhPickerVisible(false); }}
                >
                  <Text style={styles.billName}>{item.name}</Text>
                  {item.code ? <Text style={styles.billSub}>{item.code}</Text> : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.modalEmpty}>No warehouses available.</Text>}
              style={{ maxHeight: 320 }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  sectionLabel: {
    fontSize: 11, color: '#6b7280',
    letterSpacing: 0.6, fontWeight: '700',
    marginTop: 12, marginBottom: 8,
  },

  pickerField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  pickerValue: { fontSize: 14, fontWeight: '700', color: '#111' },
  pickerSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  pickerPlaceholder: { fontSize: 13, color: '#9ca3af' },

  linesCard: {
    marginTop: 14,
    backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  linesHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    marginBottom: 6,
  },
  linesTitle: { fontSize: 13, fontWeight: '800', color: '#111' },
  returnAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: NAVY,
  },
  returnAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  lineRow: {
    flexDirection: 'row', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  lineProduct: { fontSize: 13, fontWeight: '700', color: '#111' },
  lineMeta: { fontSize: 11, color: '#6b7280', marginTop: 3 },
  linePrice: { fontSize: 11, color: '#374151', marginTop: 3, fontWeight: '600' },
  qtyCol: { width: 90, alignItems: 'flex-end' },
  qtyLabel: { fontSize: 9, color: '#9ca3af', letterSpacing: 0.5, fontWeight: '700' },
  qtyInput: {
    marginTop: 4,
    width: '100%',
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 8,
    fontSize: 14, color: '#111', textAlign: 'right',
  },
  qtyMax: { fontSize: 10, color: '#9ca3af', marginTop: 3 },
  qtyMaxBad: { color: RED, fontWeight: '700' },

  totalsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6',
    marginTop: 4,
  },
  totalsLabel: { fontSize: 13, color: '#6b7280' },
  totalsValue: { fontSize: 15, fontWeight: '800', color: NAVY },

  linesEmpty: {
    marginTop: 14,
    backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 24, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  linesEmptyText: { color: '#6b7280', fontSize: 13 },

  settingsCard: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: '#111' },
  toggleSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  warehouseField: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
  },

  notesInput: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
    paddingVertical: 10, paddingHorizontal: 12,
    fontSize: 13, color: '#111',
    textAlignVertical: 'top', minHeight: 80,
  },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  footerBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  footerBtnGhost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: NAVY },
  footerBtnGhostText: { color: NAVY, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  footerBtnPrimary: { backgroundColor: RED },
  footerBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },

  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  modalSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f9fafb',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
    marginVertical: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  modalSearchInput: { flex: 1, fontSize: 13, color: '#111', padding: 0 },
  modalEmpty: { textAlign: 'center', color: '#6b7280', paddingVertical: 24, fontSize: 13 },

  billRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  billName: { fontSize: 13, fontWeight: '700', color: '#111' },
  billSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  billAmount: { fontSize: 13, fontWeight: '800', color: NAVY, marginLeft: 8 },
});

export default QuickPurchaseReturnFormScreen;
