// InvoiceDetailScreen.js
//
// Detail view for one account.move (Invoice or Credit Note). Opened when
// the user taps a row in InvoicesListScreen.
//
// Layout:
//  - Header card: number, partner, dates, status badges
//  - Amount card: untaxed, tax, total, residual
//  - Lines table: product / qty / price_unit / subtotal
//  - Action row: state-conditional buttons (Pay / Reset to Draft / Credit
//    Note / Cancel) using the same alertButton style as LogoutModal so
//    every interactive button stays on the primary theme color.
import React, { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, ActivityIndicator, ScrollView, Alert, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import Text from '@components/Text';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import {
  fetchInvoiceDetailOdoo,
  resetInvoiceToDraftOdoo,
  postInvoiceOdoo,
  cancelInvoiceOdoo,
  createCreditNoteOdoo,
  registerPaymentForInvoiceOdoo,
} from '@api/services/generalApi';

const formatDate = (s) => {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return String(s); }
};

// Status color shared with the list screen — keeps every state badge in
// the same palette across the app.
const stateColor = (state, payment_state) => {
  if (payment_state === 'paid') return '#16a34a';
  if (payment_state === 'partial' || payment_state === 'in_payment') return '#d97706';
  if (state === 'posted') return '#2563eb';
  if (state === 'cancel') return '#dc2626';
  return '#6b7280';
};
const stateLabel = (state, payment_state, move_type) => {
  if (state === 'cancel') return 'Cancelled';
  if (state === 'draft') return 'Draft';
  if (payment_state === 'paid') return 'Paid';
  if (payment_state === 'partial') return 'Partial';
  if (payment_state === 'in_payment') return 'In Payment';
  return move_type === 'out_refund' ? 'Credit Note' : 'Posted';
};

const InvoiceDetailScreen = ({ navigation, route }) => {
  const invoiceId = route?.params?.invoiceId;
  const currency = useAuthStore((s) => s.currency);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const resp = await fetchInvoiceDetailOdoo(invoiceId);
    if (resp?.error) {
      showToastMessage(resp.error?.data?.message || resp.error?.message || 'Failed to load invoice');
      setInvoice(null);
    } else {
      setInvoice(resp.result);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (fn, successMsg) => {
    setActing(true);
    try {
      const resp = await fn();
      if (resp?.error) {
        showToastMessage(resp.error?.data?.message || resp.error?.message || 'Action failed');
      } else {
        showToastMessage(successMsg);
        await load();
      }
    } finally {
      setActing(false);
    }
  };

  const onResetToDraft = () =>
    Alert.alert('Reset to Draft', 'Are you sure you want to reset this invoice to draft?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => runAction(() => resetInvoiceToDraftOdoo(invoiceId), 'Reset to draft') },
    ]);

  const onPost = () => runAction(() => postInvoiceOdoo(invoiceId), 'Invoice posted');

  const onCancel = () =>
    Alert.alert('Cancel Invoice', 'Are you sure you want to cancel this invoice?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: () => runAction(() => cancelInvoiceOdoo(invoiceId), 'Invoice cancelled') },
    ]);

  const onCreditNote = () =>
    Alert.alert('Credit Note', 'Create a credit note (reversal) for this invoice?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Create', onPress: () => runAction(() => createCreditNoteOdoo({ moveId: invoiceId }), 'Credit note created') },
    ]);

  const onPay = async () => {
    if (!invoice) return;
    const journalId = Array.isArray(invoice.journal_id) ? invoice.journal_id[0] : invoice.journal_id;
    const partnerId = Array.isArray(invoice.partner_id) ? invoice.partner_id[0] : invoice.partner_id;
    const residual = Number(invoice.amount_residual) || 0;
    if (residual <= 0) {
      showToastMessage('Invoice already fully paid');
      return;
    }
    runAction(
      () => registerPaymentForInvoiceOdoo({ invoiceId, amount: residual, journalId, partnerId }),
      'Payment registered',
    );
  };

  if (loading) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Invoice" onBackPress={() => navigation.goBack()} />
        <View style={s.loadingBox}>
          <ActivityIndicator color={COLORS.primaryThemeColor} />
        </View>
      </SafeAreaView>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Invoice" onBackPress={() => navigation.goBack()} />
        <View style={s.loadingBox}>
          <Text style={s.muted}>Invoice not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const partner = Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : '—';
  const journal = Array.isArray(invoice.journal_id) ? invoice.journal_id[1] : '—';
  const salesperson = Array.isArray(invoice.invoice_user_id) ? invoice.invoice_user_id[1] : '—';
  const paymentTerm = Array.isArray(invoice.invoice_payment_term_id) ? invoice.invoice_payment_term_id[1] : '—';
  const color = stateColor(invoice.state, invoice.payment_state);
  const label = stateLabel(invoice.state, invoice.payment_state, invoice.move_type);
  const isPosted = invoice.state === 'posted';
  const isDraft = invoice.state === 'draft';
  const isCancel = invoice.state === 'cancel';
  const residual = Number(invoice.amount_residual) || 0;
  const isRefund = invoice.move_type === 'out_refund';

  return (
    <SafeAreaView>
      <NavigationHeader title={invoice.name || 'Invoice'} onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Header card */}
          <View style={s.card}>
            <View style={s.headerRow}>
              <View style={[s.iconDisk, { backgroundColor: isRefund ? '#FEE2E2' : '#E7F1FD' }]}>
                <MaterialIcons name={isRefund ? 'undo' : 'description'} size={22} color={isRefund ? '#b91c1c' : '#1E88E5'} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.number}>{invoice.name || '—'}</Text>
                <View style={[s.badge, { backgroundColor: color + '20' }]}>
                  <Text style={[s.badgeText, { color }]}>{label}</Text>
                </View>
              </View>
              <Text style={[s.total, isRefund && { color: '#b91c1c' }]}>
                {formatCurrency(Number(invoice.amount_total) || 0, currency)}
              </Text>
            </View>
            <View style={s.divider} />
            <Detail icon="person" label="Customer" value={partner} />
            <Detail icon="event" label="Invoice Date" value={formatDate(invoice.invoice_date)} />
            <Detail icon="schedule" label="Due Date" value={formatDate(invoice.invoice_date_due)} />
            <Detail icon="account-balance" label="Journal" value={journal} />
            <Detail icon="badge" label="Salesperson" value={salesperson} />
            <Detail icon="payments" label="Payment Term" value={paymentTerm} />
            {invoice.ref ? <Detail icon="link" label="Reference" value={invoice.ref} /> : null}
            {invoice.invoice_origin ? <Detail icon="source" label="Source Document" value={invoice.invoice_origin} /> : null}
          </View>

          {/* Amount card */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Amounts</Text>
            <AmountRow label="Untaxed" value={formatCurrency(Number(invoice.amount_untaxed) || 0, currency)} />
            <AmountRow label="Tax" value={formatCurrency(Number(invoice.amount_tax) || 0, currency)} />
            <AmountRow label="Total" value={formatCurrency(Number(invoice.amount_total) || 0, currency)} bold />
            {residual > 0 ? (
              <AmountRow label="Amount Due" value={formatCurrency(residual, currency)} highlight />
            ) : null}
          </View>

          {/* Line items */}
          {Array.isArray(invoice.lines) && invoice.lines.length > 0 ? (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Invoice Lines</Text>
              {invoice.lines.map((ln) => (
                <View key={ln.id} style={s.lineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lineName}>{ln.name || (Array.isArray(ln.product_id) ? ln.product_id[1] : '—')}</Text>
                    <Text style={s.lineMeta}>
                      {`Qty ${Number(ln.quantity) || 0} × ${formatCurrency(Number(ln.price_unit) || 0, currency)}`}
                      {Number(ln.discount) > 0 ? `  •  -${Number(ln.discount)}%` : ''}
                    </Text>
                  </View>
                  <Text style={s.lineAmt}>{formatCurrency(Number(ln.price_subtotal) || 0, currency)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {invoice.narration ? (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Note</Text>
              <Text style={s.muted}>{String(invoice.narration).replace(/<[^>]+>/g, '')}</Text>
            </View>
          ) : null}

          {/* Action buttons — state-conditional */}
          <View style={s.actionsCard}>
            {isDraft ? (
              <ActionButton icon="check-circle" label="Confirm & Post" onPress={onPost} disabled={acting} />
            ) : null}
            {isPosted && residual > 0 ? (
              <ActionButton icon="payments" label={`Pay ${formatCurrency(residual, currency)}`} onPress={onPay} disabled={acting} />
            ) : null}
            {isPosted && !isRefund ? (
              <ActionButton icon="undo" label="Credit Note" onPress={onCreditNote} disabled={acting} variant="secondary" />
            ) : null}
            {(isPosted || isCancel) ? (
              <ActionButton icon="restore" label="Reset to Draft" onPress={onResetToDraft} disabled={acting} variant="secondary" />
            ) : null}
            {!isCancel && !isDraft ? null : (
              !isCancel ? <ActionButton icon="cancel" label="Cancel Invoice" onPress={onCancel} disabled={acting} variant="danger" /> : null
            )}
          </View>
        </ScrollView>
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default InvoiceDetailScreen;

const Detail = ({ icon, label, value }) => (
  <View style={s.detailRow}>
    <MaterialIcons name={icon} size={14} color="#6b7280" />
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={s.detailValue}>{value}</Text>
  </View>
);

const AmountRow = ({ label, value, bold, highlight }) => (
  <View style={s.amountRow}>
    <Text style={[s.amountLabel, bold && s.amountBold]}>{label}</Text>
    <Text style={[s.amountValue, bold && s.amountBold, highlight && { color: '#d97706' }]}>{value}</Text>
  </View>
);

const ActionButton = ({ icon, label, onPress, disabled, variant = 'primary' }) => {
  const palette = variant === 'danger' ? { bg: '#dc2626', fg: '#fff' }
    : variant === 'secondary' ? { bg: '#f3f4f6', fg: '#111827' }
    : { bg: COLORS.primaryThemeColor, fg: '#fff' };
  return (
    <TouchableOpacity
      style={[s.actionBtn, { backgroundColor: palette.bg, opacity: disabled ? 0.6 : 1 }]}
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
    >
      <MaterialIcons name={icon} size={18} color={palette.fg} />
      <Text style={[s.actionBtnText, { color: palette.fg }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  loadingBox: { padding: 32, alignItems: 'center' },
  muted: { color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginHorizontal: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  iconDisk: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 15, color: '#111827' },
  badge: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold },
  total: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 16, color: '#111827' },
  divider: { height: 1, backgroundColor: '#f1f2f6', marginVertical: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  detailLabel: { marginLeft: 6, fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, width: 110 },
  detailValue: { flex: 1, fontSize: 13, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium },
  sectionTitle: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginBottom: 8, color: '#111827' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  amountLabel: { color: '#374151', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium },
  amountValue: { color: '#111827', fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium },
  amountBold: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14 },
  lineRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f2f6' },
  lineName: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 13, color: '#111827' },
  lineMeta: { fontFamily: FONT_FAMILY.urbanistMedium, fontSize: 12, color: '#6b7280', marginTop: 2 },
  lineAmt: { fontFamily: FONT_FAMILY.urbanistBold, fontSize: 13, color: '#111827' },
  actionsCard: { paddingHorizontal: 12, paddingTop: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10,
    marginBottom: 10,
  },
  actionBtnText: { marginLeft: 8, fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14 },
});
