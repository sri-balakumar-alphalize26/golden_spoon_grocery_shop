import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { SafeAreaView as SafeAreaViewNative } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchPosOrderDetailOdoo, fetchPosOrderPaymentsOdoo } from '@api/services/generalApi';
import { formatCurrency } from '@utils/currency';
import { generateInvoiceHtml, extractOrderRef } from '@utils/invoiceHtml';
import useAuthStore from '@stores/auth/useAuthStore';
import Toast from 'react-native-toast-message';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const SOFT_GREEN_BG = '#DCFCE7';
const SOFT_GREEN_FG = '#166534';
const MUTED = '#8896ab';

const stateBadge = (state) => {
  switch (state) {
    case 'draft': return { bg: '#F3F4F6', fg: '#6B7280', label: 'New' };
    case 'paid': return { bg: SOFT_GREEN_BG, fg: SOFT_GREEN_FG, label: 'Paid' };
    case 'done': return { bg: '#DBEAFE', fg: '#1E40AF', label: 'Posted' };
    case 'invoiced': return { bg: '#DBEAFE', fg: '#1E40AF', label: 'Invoiced' };
    case 'cancel': return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Cancelled' };
    default: return { bg: '#F3F4F6', fg: '#6B7280', label: state || '—' };
  }
};

// Odoo returns datetimes as naive UTC strings ("2026-05-07 04:57:00") with
// no timezone marker. Hermes and most JS engines parse that format as
// LOCAL time, so the displayed clock would shift by the user's UTC offset
// (e.g. IST users would see 04:57 instead of the 10:27 that Odoo's web UI
// shows). Force-interpret the string as UTC so toLocaleString converts it
// back to the user's local zone correctly.
const parseOdooDate = (s) => {
  if (!s) return null;
  const str = String(s);
  const iso = str.includes('T') ? str : str.replace(' ', 'T');
  const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  const d = new Date(withTz);
  return isNaN(d.getTime()) ? null : d;
};

const formatDate = (s) => {
  if (!s) return '—';
  const d = parseOdooDate(s);
  if (!d) return s;
  return d.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const OrderDetailScreen = ({ navigation, route }) => {
  const { orderId } = route?.params || {};
  const currency = useAuthStore((state) => state.currency) || { symbol: 'ر.ع.', position: 'before' };
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  // Each `pos.payment` attached to this order — drives the Payments card so
  // split-paid orders surface every method + amount instead of just the
  // aggregate `amount_paid`.
  const [payments, setPayments] = useState([]);

  // Invoice-action state — Preview / Download / Print mirror the buttons on
  // the post-payment receipt screen, so the cashier can re-export any past
  // order's invoice from the orders list.
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Map the fetched pos.order + pos.payment[] into the params expected by the
  // shared `generateInvoiceHtml` helper. Kept inline because it depends on
  // the screen's `order` and `payments` state.
  const buildInvoiceParams = () => {
    if (!order) return null;
    const lines = Array.isArray(order.lines) ? order.lines : [];
    const items = lines.map((l) => ({
      id: l.id,
      name: l.full_product_name || l.product_name || l.name || 'Product',
      qty: Number(l.qty || l.quantity || 1),
      price: Number(l.price_unit || l.price || 0),
      discount_percent: Number(l.discount || 0),
      subtotal: Number(l.price_subtotal_incl ?? l.price_subtotal ?? 0),
    }));
    const partner = Array.isArray(order.partner_id) ? order.partner_id : null;
    const customer = partner ? { name: partner[1] } : null;
    // Raw subtotal = sum of (price_unit × qty) across every line,
    // BEFORE any per-line discount %. amount_total is the discounted
    // figure that Odoo persisted, so the difference is the rolled-up
    // total discount the cashier applied (whether it came from this
    // app's total-discount UI as a flat % on every line or from any
    // mix of per-line discounts entered elsewhere).
    const rawSubtotal = lines.reduce(
      (s, l) => s + (Number(l.price_unit || l.price || 0) * Number(l.qty || l.quantity || 1)),
      0,
    );
    const amountTotal = Number(order.amount_total || 0);
    const amountTax = Number(order.amount_tax || 0);
    const rolledDiscount = Math.max(
      0,
      Math.round((rawSubtotal - (amountTotal - amountTax)) * 1000) / 1000,
    );
    return {
      items,
      subtotal: rawSubtotal,
      tax: amountTax,
      service: 0,
      total: amountTotal,
      discount: rolledDiscount,
      orderId: order.id,
      orderName: order.name || '',
      paidAmount: Number(order.amount_paid || 0),
      customer,
      payments,
    };
  };

  const handlePrintPreview = () => {
    try {
      const params = buildInvoiceParams();
      if (!params) return;
      setPreviewHtml(generateInvoiceHtml(params));
      setPreviewVisible(true);
    } catch (err) {
      console.error('[OrderDetail] preview error', err);
      Toast.show({ type: 'error', text1: 'Preview failed', text2: err?.message || 'Unable to render preview', position: 'bottom' });
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const params = buildInvoiceParams();
      if (!params) throw new Error('Order not loaded');
      const filename = `Invoice-${extractOrderRef(order?.name, order?.id)}.pdf`;
      const html = generateInvoiceHtml(params);
      const { uri } = await Print.printToFileAsync({ html });
      if (!uri) throw new Error('Failed to generate PDF');

      if (Platform.OS === 'android') {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perm.granted) {
          Toast.show({ type: 'info', text1: 'Save cancelled', position: 'bottom' });
          return;
        }
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
          perm.directoryUri,
          filename,
          'application/pdf'
        );
        await FileSystem.writeAsStringAsync(targetUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        Toast.show({ type: 'success', text1: 'Saved', text2: filename, position: 'bottom' });
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            UTI: 'com.adobe.pdf',
            dialogTitle: filename,
          });
        } else {
          Toast.show({ type: 'error', text1: 'Save failed', text2: 'Sharing is not available on this device', position: 'bottom' });
        }
      }
    } catch (err) {
      console.error('[OrderDetail] download error', err);
      Toast.show({ type: 'error', text1: 'Download failed', text2: err?.message || 'Unable to generate PDF', position: 'bottom' });
    } finally {
      setDownloading(false);
    }
  };

  const handlePrintReceipt = async () => {
    setPrinting(true);
    try {
      const params = buildInvoiceParams();
      if (!params) throw new Error('Order not loaded');
      const html = generateInvoiceHtml(params);
      await Print.printAsync({ html });
    } catch (err) {
      if (err?.message && !/cancel/i.test(err.message)) {
        console.error('[OrderDetail] print error', err);
        Toast.show({ type: 'error', text1: 'Print failed', text2: err?.message, position: 'bottom' });
      }
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!orderId) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetchPosOrderDetailOdoo(orderId),
      fetchPosOrderPaymentsOdoo(orderId),
    ])
      .then(([orderRes, paymentRows]) => {
        if (!alive) return;
        if (orderRes?.error) {
          Toast.show({ type: 'error', text1: 'Failed to load order', position: 'bottom' });
          return;
        }
        setOrder(orderRes);
        setPayments(Array.isArray(paymentRows) ? paymentRows : []);
      })
      .catch(() => {
        Toast.show({ type: 'error', text1: 'Failed to load order', position: 'bottom' });
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [orderId]);

  if (loading) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={s.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Order</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.center}>
          <Text style={{ color: MUTED }}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = stateBadge(order.state);

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>Order {order.name}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: '#F5F6FA' }}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View style={[s.successDisk, { backgroundColor: badge.bg }]}>
              <MaterialIcons name="check-circle" size={26} color={badge.fg} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.orderName}>{order.name || '—'}</Text>
              {order.pos_reference ? (
                <Text style={s.receiptText}>Receipt {order.pos_reference}</Text>
              ) : null}
            </View>
            <View style={[s.statusPill, { backgroundColor: badge.bg }]}>
              <Text style={[s.statusText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          </View>

          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>DATE</Text>
              <Text style={s.metaValue}>{formatDate(order.date_order)}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>CUSTOMER</Text>
              <Text style={s.metaValue} numberOfLines={1}>{order.partner?.name || '—'}</Text>
            </View>
          </View>
          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>SALESPERSON</Text>
              <Text style={s.metaValue} numberOfLines={1}>{order.user?.name || '—'}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>REGISTER</Text>
              <Text style={s.metaValue} numberOfLines={1}>{order.config?.name || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Lines */}
        <Text style={s.sectionTitle}>ITEMS</Text>
        <View style={s.linesCard}>
          {order.lines.length === 0 ? (
            <Text style={[s.metaValue, { color: MUTED, textAlign: 'center', paddingVertical: 14 }]}>
              No items on this order
            </Text>
          ) : (
            order.lines.map((line, idx) => (
              <View
                key={String(line.id)}
                style={[s.lineRow, idx === order.lines.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={s.lineThumbWrap}>
                  {line.image_url ? (
                    <Image
                      source={{ uri: line.image_url }}
                      style={s.lineThumb}
                    />
                  ) : (
                    <View style={[s.lineThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef0f5' }]}>
                      <MaterialIcons name="inventory-2" size={20} color={MUTED} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.lineName} numberOfLines={2}>{line.name}</Text>
                  <Text style={s.lineMeta}>
                    {line.qty} × {formatCurrency(line.price_unit, currency)}
                    {line.discount > 0 ? `  •  −${line.discount}%` : ''}
                  </Text>
                </View>
                <Text style={s.lineSubtotal}>{formatCurrency(line.price_subtotal_incl || line.price_subtotal, currency)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        <View style={s.totalsCard}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Tax</Text>
            <Text style={s.totalValue}>{formatCurrency(order.amount_tax, currency)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Paid</Text>
            <Text style={s.totalValue}>{formatCurrency(order.amount_paid, currency)}</Text>
          </View>
          {order.amount_return > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Change</Text>
              <Text style={s.totalValue}>{formatCurrency(order.amount_return, currency)}</Text>
            </View>
          ) : null}
          <View style={s.divider} />
          <View style={s.totalRow}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandValue}>{formatCurrency(order.amount_total, currency)}</Text>
          </View>
        </View>

        {/* Payments — one row per pos.payment record. For split-paid orders
            (more than one payment) this is the only place the breakdown is
            visible; the totals card alone just shows `amount_paid` and hides
            which methods made it up. */}
        {payments && payments.length > 0 ? (
          <View style={s.totalsCard}>
            <View style={s.paymentsHeaderRow}>
              <Text style={s.sectionTitle}>
                {payments.length > 1 ? 'PAYMENTS (SPLIT)' : 'PAYMENT'}
              </Text>
              {payments.length > 1 ? (
                <View style={s.splitBadge}>
                  <MaterialIcons name="call-split" size={12} color="#9A3412" />
                  <Text style={s.splitBadgeText}>{`${payments.length} methods`}</Text>
                </View>
              ) : null}
            </View>
            {payments.map((p, idx) => (
              <View key={p.id || idx} style={s.totalRow}>
                <Text style={s.totalLabel} numberOfLines={1}>
                  {p.method_name || 'Payment'}
                </Text>
                <Text style={s.totalValue}>{formatCurrency(p.amount, currency)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Invoice actions — Preview / Download / Print. Mirror of the chips
            on the post-payment receipt screen so any past order can be
            re-exported from the orders list. */}
        <View style={s.invoiceActionRow}>
          <TouchableOpacity
            onPress={handlePrintPreview}
            activeOpacity={0.85}
            style={[s.invoiceChip, { borderColor: '#BFDBFE' }]}
          >
            <View style={s.invoiceChipIcon}>
              <MaterialIcons name="preview" size={20} color="#1E88E5" />
            </View>
            <Text style={s.invoiceChipText}>Preview</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDownloadPdf}
            disabled={downloading}
            activeOpacity={0.85}
            style={[s.invoiceChip, { borderColor: '#FED7AA' }, downloading && { opacity: 0.6 }]}
          >
            <View style={s.invoiceChipIcon}>
              {downloading ? (
                <ActivityIndicator color="#E85D04" size="small" />
              ) : (
                <MaterialIcons name="file-download" size={20} color="#E85D04" />
              )}
            </View>
            <Text style={s.invoiceChipText}>Download</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handlePrintReceipt}
            disabled={printing}
            activeOpacity={0.85}
            style={[s.invoiceChip, { borderColor: '#E9D5FF' }, printing && { opacity: 0.6 }]}
          >
            <View style={s.invoiceChipIcon}>
              {printing ? (
                <ActivityIndicator color="#7B2D8E" size="small" />
              ) : (
                <MaterialCommunityIcons name="printer" size={20} color="#7B2D8E" />
              )}
            </View>
            <Text style={s.invoiceChipText}>Print</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Preview modal — full-screen WebView showing the rendered receipt. */}
      <Modal
        visible={previewVisible}
        animationType="slide"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <SafeAreaViewNative style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
          <View style={s.previewHeader}>
            <Text style={s.previewTitle}>Print Preview</Text>
            <TouchableOpacity
              onPress={() => setPreviewVisible(false)}
              style={s.previewClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: previewHtml }}
            style={{ flex: 1, backgroundColor: '#fff' }}
          />
        </SafeAreaViewNative>
      </Modal>
    </SafeAreaView>
  );
};

export default OrderDetailScreen;

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: {
    flex: 1, textAlign: 'center',
    color: '#fff', fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  successDisk: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  orderName: { fontSize: 17, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.2 },
  receiptText: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.3 },

  metaRow: { flexDirection: 'row', marginTop: 8, gap: 12 },
  metaCell: { flex: 1 },
  metaLabel: {
    fontSize: 10, color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: 13, color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    marginTop: 2, letterSpacing: 0.2,
  },

  sectionTitle: {
    fontSize: 11, color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginLeft: 4, marginBottom: 6,
  },

  linesCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 4,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F2F6',
  },
  lineThumbWrap: { width: 44, height: 44 },
  lineThumb: { width: 44, height: 44, borderRadius: 8 },
  lineName: { fontSize: 13, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold },
  lineMeta: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  lineSubtotal: {
    fontSize: 13, color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginLeft: 8,
  },

  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    // Stack-spacing — the Totals and Payments cards both reuse this style
    // and render back-to-back in the ScrollView; without the bottom margin
    // they sit flush against each other and look like one bleeding card.
    // Mirrors `linesCard.marginBottom`.
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: MUTED, fontFamily: FONT_FAMILY.urbanistMedium },
  totalValue: { fontSize: 13, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold },
  divider: { height: 1, backgroundColor: '#F1F2F6', marginVertical: 8 },
  grandLabel: { fontSize: 15, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  grandValue: { fontSize: 17, color: ORANGE, fontFamily: FONT_FAMILY.urbanistBold },

  // Payments card — header row with title + optional split badge
  paymentsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  splitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEDD5',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  splitBadgeText: {
    fontSize: 11,
    color: '#9A3412',
    fontFamily: FONT_FAMILY.urbanistBold,
    marginLeft: 4,
    letterSpacing: 0.3,
  },

  // Invoice action buttons (Preview / Download / Print)
  invoiceActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  invoiceChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  invoiceChipIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  invoiceChipText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  // Preview modal — header bar + close button
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F6',
  },
  previewTitle: {
    fontSize: 15,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  previewClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
