import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import {
  fetchEasyPurchaseDetail, cancelEasyPurchase, draftEasyPurchase, confirmEasyPurchase,
  updateEasyPurchase,
  readPurchaseOrder, readStockPicking, readVendorBill, readPayments,
  fetchPurchaseTaxes,
} from '@api/services/easyPurchaseApi';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import { FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const STATE_STYLE = {
  draft: { bg: '#fff7ed', fg: '#b45309', label: 'DRAFT' },
  done: { bg: '#ecfdf5', fg: '#15803d', label: 'DONE' },
  cancelled: { bg: '#fee2e2', fg: '#b91c1c', label: 'CANCELLED' },
};

// Render a money value with the Odoo-configured company currency.
const fmt = (v) => formatCurrency(v);

const Section = ({ title, children, right }) => (
  <View style={styles.card}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
    {children}
  </View>
);

const Row = ({ label, value, color }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, color && { color }]} numberOfLines={2}>{value || '—'}</Text>
  </View>
);

const EasyPurchaseDetailScreen = ({ navigation, route }) => {
  const id = route?.params?.id;
  // Subscribe so the screen re-renders when the currency hydrates / changes.
  useAuthStore((s) => s.currency);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState({ po: null, picking: null, bill: null, payments: [] });
  const [taxesById, setTaxesById] = useState({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await fetchEasyPurchaseDetail(id);
      setData(d);
      // Pull linked records + the purchase-tax catalog in parallel
      const [po, picking, bill, payments, taxes] = await Promise.all([
        d.purchase_order_id ? readPurchaseOrder(d.purchase_order_id[0] ?? d.purchase_order_id) : null,
        d.picking_id ? readStockPicking(d.picking_id[0] ?? d.picking_id) : null,
        d.invoice_id ? readVendorBill(d.invoice_id[0] ?? d.invoice_id) : null,
        d.payment_ids?.length ? readPayments(d.payment_ids) : [],
        fetchPurchaseTaxes().catch(() => []),
      ]);
      setLinked({ po, picking, bill, payments: payments || [] });
      const map = {};
      (taxes || []).forEach((t) => { map[t.id] = t; });
      setTaxesById(map);
    } catch (e) {
      console.error('[EasyPurchaseDetail]', e);
      showToastMessage(e?.message || 'Failed to load detail');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onCancel = () => {
    Alert.alert('Cancel Purchase', 'Are you sure you want to cancel this purchase?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try { await cancelEasyPurchase(id); await load(); showToastMessage('Cancelled'); }
          catch (e) { showToastMessage(e?.message || 'Failed to cancel'); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const onConfirm = () => {
    Alert.alert('Confirm Order', 'Confirm this purchase order?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setBusy(true);
          try {
            // Disable auto_register_payment + auto_validate_bill on this
            // draft before confirming. With either flag on, an order whose
            // total is $0 (e.g. cashier saved a draft with no prices yet)
            // makes Odoo's account.payment.register raise "nothing left to
            // pay" and the whole confirm chain fails. The cashier can
            // register payment manually later, or fix the price first.
            try { await updateEasyPurchase(id, { auto_register_payment: false, auto_validate_bill: false }); }
            catch (wErr) { console.warn('[EasyPurchase] update before confirm failed:', wErr?.message || wErr); }
            await confirmEasyPurchase(id);
            await load();
            showToastMessage('Confirmed');
          } catch (e) {
            showToastMessage(e?.message || 'Failed to confirm');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onDraft = async () => {
    setBusy(true);
    try { await draftEasyPurchase(id); await load(); showToastMessage('Reset to draft'); }
    catch (e) { showToastMessage(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  if (loading && !data) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="Purchase Detail" onBackPress={() => navigation.goBack()} />
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="Purchase Detail" onBackPress={() => navigation.goBack()} />
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={styles.metaText}>Not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const state = STATE_STYLE[data.state] || STATE_STYLE.draft;

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title={data.name || 'Purchase'} onBackPress={() => navigation.goBack()} />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>

        {/* Status banner */}
        <View style={[styles.banner, { backgroundColor: state.bg }]}>
          <MaterialIcons name="info" size={18} color={state.fg} />
          <Text style={[styles.bannerText, { color: state.fg }]}>{state.label}</Text>
        </View>

        {/* Header info */}
        <Section title="Purchase Header">
          <Row label="Reference" value={data.name} />
          <Row label="Vendor" value={data.partner_id?.[1]} />
          <Row label="Date" value={data.date} />
          <Row label="Vendor Reference" value={data.reference} />
          <Row label="Discount Type" value={data.discount_type} />
          <Row label="Currency" value={data.currency_id?.[1]} />
          <Row label="Company" value={data.company_id?.[1]} />
        </Section>

        {/* Payment & Warehouse */}
        <Section title="Payment & Warehouse">
          <Row label="Payment Method" value={data.payment_method_id?.[1]} />
          {data.payment_term_id ? <Row label="Payment Terms" value={data.payment_term_id?.[1]} /> : null}
          <Row label="Warehouse" value={data.warehouse_id?.[1]} />
          <Row label="Auto-Post Bill" value={data.auto_validate_bill ? 'Yes' : 'No'} />
          <Row label="Auto-Register Payment" value={data.auto_register_payment ? 'Yes' : 'No'} />
          <Row label="Payment Status" value={data.payment_state} color={data.payment_state === 'paid' ? '#15803d' : '#b45309'} />
        </Section>

        {/* Lines */}
        <Section title={`Product Lines (${(data.lines || []).length})`}>
          {(data.lines || []).map((l) => {
            const lineTaxes = (l.tax_ids || []).map((tid) => taxesById[tid]).filter(Boolean);
            const productName = Array.isArray(l.product_id) ? l.product_id[1] : (l.description || 'Product');
            const showDescription = l.description && l.description !== productName && l.description !== (Array.isArray(l.product_id) ? l.product_id[1] : null);
            const total = l.total != null ? l.total : Number(l.subtotal || 0) + Number(l.tax_amount || 0);
            return (
              <View key={l.id} style={styles.lineCard}>
                {/* Top row: name + description */}
                <View style={styles.lineTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineName} numberOfLines={1}>{productName}</Text>
                    {showDescription ? (
                      <Text style={styles.lineDesc} numberOfLines={1}>{l.description}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Column grid */}
                <View style={styles.lineGrid}>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Qty</Text>
                    <Text style={styles.lineCellValue}>{Number(l.quantity || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Unit</Text>
                    <Text style={styles.lineCellValue}>{fmt(l.price_unit)}</Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Discount</Text>
                    <Text style={styles.lineCellValue}>
                      {Number(l.discount || 0).toFixed(2)}{l.discount_type === 'percentage' ? '%' : ''}
                    </Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Subtotal</Text>
                    <Text style={styles.lineCellValue}>{fmt(l.subtotal)}</Text>
                  </View>
                  <View style={styles.lineCell}>
                    <Text style={styles.lineCellLabel}>Tax</Text>
                    <Text style={styles.lineCellValue}>{fmt(l.tax_amount)}</Text>
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
          {(!data.lines || data.lines.length === 0) ? <Text style={styles.metaText}>No lines</Text> : null}
        </Section>

        {/* Linked records */}
        {(linked.po || linked.picking || linked.bill || linked.payments?.length) ? (
          <Section title="Linked Records">
            {linked.po ? (
              <Row label="Purchase Order" value={`${linked.po.name}  •  ${linked.po.state}`} color="#1d4ed8" />
            ) : null}
            {linked.picking ? (
              <Row label="Receipt" value={`${linked.picking.name}  •  ${linked.picking.state}`} color="#15803d" />
            ) : null}
            {linked.bill ? (
              <Row label="Vendor Bill" value={`${linked.bill.name}  •  ${linked.bill.state} (${linked.bill.payment_state})`} color="#b45309" />
            ) : null}
            {(linked.payments || []).map((p) => (
              <Row
                key={`pay-${p.id}`}
                label={p.name || `Payment #${p.id}`}
                value={`${fmt(p.amount)}  •  ${p.state}`}
                color="#15803d"
              />
            ))}
          </Section>
        ) : null}

        {/* Notes */}
        {data.notes ? (
          <Section title="Notes">
            <Text style={styles.metaText}>{data.notes}</Text>
          </Section>
        ) : null}

        {/* Totals */}
        <View style={[styles.card, { backgroundColor: NAVY }]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelDark}>Untaxed</Text>
            <Text style={styles.totalValueDark}>{fmt(data.amount_untaxed)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelDark}>Taxes</Text>
            <Text style={styles.totalValueDark}>{fmt(data.amount_tax)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 8, marginTop: 8 }]}>
            <Text style={styles.totalLabelDarkBold}>Total</Text>
            <Text style={styles.totalValueDarkBold}>{fmt(data.amount_total)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action footer */}
      <View style={styles.bottomBar}>
        {data.state === 'draft' ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <FeatureGate featureKey="easy_purchase.cancel">
              <TouchableOpacity
                style={[styles.btn, styles.btnDanger, { flex: 1 }, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={onCancel}
              >
                <MaterialIcons name="cancel" size={18} color="#fff" />
                <Text style={styles.btnDangerText}>Cancel Purchase</Text>
              </TouchableOpacity>
            </FeatureGate>
            <FeatureGate featureKey="easy_purchase.confirm">
              <TouchableOpacity
                style={[styles.btn, styles.btnConfirm, { flex: 1 }, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={onConfirm}
              >
                <MaterialIcons name="check-circle" size={18} color="#fff" />
                <Text style={styles.btnConfirmText}>Confirm Order</Text>
              </TouchableOpacity>
            </FeatureGate>
          </View>
        ) : data.state === 'cancelled' ? (
          <FeatureGate featureKey="easy_purchase.cancel">
            <TouchableOpacity style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]} disabled={busy} onPress={onDraft}>
              <MaterialIcons name="restore" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Reset to Draft</Text>
            </TouchableOpacity>
          </FeatureGate>
        ) : (
          <View style={styles.donePill}>
            <MaterialIcons name="check-circle" size={18} color="#15803d" />
            <Text style={styles.donePillText}>Completed</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 12,
  },
  bannerText: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 12, letterSpacing: 0.4 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { flex: 1, fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold },
  rowValue: { flex: 1.4, fontSize: 13, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'right' },
  metaText: { fontSize: 13, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium },

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
  lineName: { fontSize: 14, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  lineDesc: { fontSize: 11, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2 },
  linePrintBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    marginLeft: 8,
  },
  linePrintText: { color: '#fff', fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 2 },
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

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabelDark: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: FONT_FAMILY.urbanistSemiBold },
  totalValueDark: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },
  totalLabelDarkBold: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },
  totalValueDarkBold: { color: '#fff', fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnPrimary: { backgroundColor: NAVY },
  btnPrimaryText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginLeft: 4 },
  btnDanger: { backgroundColor: '#dc2626' },
  btnDangerText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginLeft: 4 },
  btnConfirm: { backgroundColor: '#10b981' },
  btnConfirmText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginLeft: 4 },
  donePill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#ecfdf5', paddingVertical: 12, borderRadius: 12,
  },
  donePillText: { color: '#15803d', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginLeft: 6 },
});

export default EasyPurchaseDetailScreen;
