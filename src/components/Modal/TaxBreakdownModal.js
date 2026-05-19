// TaxBreakdownModal — per-line tax detail popup. Used from the Orders list
// (lazy-loads the order detail on tap) and from the Order Detail screen
// (passes the already-loaded order in). Mirrors the visual language of
// the inline Payments card on OrderDetailScreen so the cashier sees a
// familiar layout, but rendered in a centred modal instead of inline.
import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { formatCurrency } from '@utils/currency';

const NAVY = '#2E294E';
const ORANGE = '#F47B20';

const ctaShadow = (color) => Platform.select({
  ios: { shadowColor: color, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 7 },
});

const num = (v, currency) => formatCurrency(v, currency || { symbol: '', name: '', position: 'before' });

const TaxBreakdownModal = ({
  isVisible,
  order,
  loading = false,
  currency,
  onClose,
}) => {
  const lines = Array.isArray(order?.lines) ? order.lines : [];
  const amountTax = Number(order?.amount_tax || 0);
  const amountTotal = Number(order?.amount_total || 0);
  const subtotal = lines.reduce((s, l) => s + (Number(l.price_subtotal) || 0), 0);
  const orderName = order?.name && order.name !== '/' ? order.name : (order?.pos_reference || '');

  return (
    <Modal
      visible={!!isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={s.overlay}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={s.card}>
          <View style={s.headerRow}>
            <View style={s.titleRow}>
              <MaterialIcons name="receipt-long" size={22} color={NAVY} />
              <View style={{ marginLeft: 8 }}>
                <Text style={s.title}>Tax Breakdown</Text>
                {orderName ? <Text style={s.subtitleMuted}>{`Order ${orderName}`}</Text> : null}
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          <Text style={s.totalTaxLine}>{`Total tax ${num(amountTax, currency)}`}</Text>

          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator color={NAVY} />
              <Text style={s.loadingText}>Loading lines…</Text>
            </View>
          ) : lines.length === 0 ? (
            <View style={s.loadingBox}>
              <Text style={s.loadingText}>No line details available.</Text>
            </View>
          ) : (
            <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
              {lines.map((l, idx) => {
                const productName = Array.isArray(l.product_id) ? l.product_id[1] : (l.full_product_name || l.name || 'Product');
                const qty = Number(l.qty || l.quantity || 0);
                const unitPrice = Number(l.price_unit || 0);
                const lineSubtotal = Number(l.price_subtotal || 0);
                const lineTotal = Number(l.price_subtotal_incl ?? l.price_subtotal ?? 0);
                const lineTax = Math.round((lineTotal - lineSubtotal) * 1000) / 1000;
                const hasTax = lineTax > 0;
                return (
                  <View key={l.id || idx} style={[s.lineCard, !hasTax && s.lineCardMuted]}>
                    <Text style={s.lineName} numberOfLines={2}>{productName}</Text>
                    <View style={s.lineRow}>
                      <Text style={s.lineMeta}>{`${qty} × ${num(unitPrice, currency)}`}</Text>
                      <Text style={s.lineMeta}>{`Line total ${num(lineTotal, currency)}`}</Text>
                    </View>
                    {hasTax ? (
                      <View style={s.lineRow}>
                        <Text style={s.lineTaxLabel}>Tax</Text>
                        <Text style={s.lineTaxValue}>{num(lineTax, currency)}</Text>
                      </View>
                    ) : (
                      <View style={s.lineRow}>
                        <Text style={s.lineNoTax}>No tax</Text>
                        <Text style={s.lineNoTax}>—</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={s.footer}>
            <View style={s.footerRow}>
              <Text style={s.footerLabel}>Subtotal</Text>
              <Text style={s.footerValue}>{num(subtotal, currency)}</Text>
            </View>
            <View style={s.footerRow}>
              <Text style={s.footerLabel}>Total Tax</Text>
              <Text style={s.footerValue}>{num(amountTax, currency)}</Text>
            </View>
            <View style={s.footerDivider} />
            <View style={s.footerRow}>
              <Text style={s.grandLabel}>Grand Total</Text>
              <Text style={s.grandValue}>{num(amountTotal, currency)}</Text>
            </View>
          </View>

          <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: NAVY,
    padding: 18,
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  title: { color: NAVY, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  subtitleMuted: { color: '#6b7280', fontSize: 11, fontWeight: '600', marginTop: 2 },
  totalTaxLine: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 6,
  },
  scroll: { marginTop: 6, maxHeight: 340 },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  lineCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  lineCardMuted: { backgroundColor: '#f3f4f6', opacity: 0.78 },
  lineName: {
    color: NAVY,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  lineMeta: { color: '#475569', fontSize: 12, fontWeight: '500' },
  lineTaxLabel: { color: ORANGE, fontSize: 12, fontWeight: '700' },
  lineTaxValue: { color: ORANGE, fontSize: 13, fontWeight: '800' },
  lineNoTax: { color: '#9ca3af', fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  footer: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  footerLabel: { color: '#475569', fontSize: 13, fontWeight: '500' },
  footerValue: { color: NAVY, fontSize: 13, fontWeight: '800' },
  footerDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 },
  grandLabel: { color: NAVY, fontSize: 14, fontWeight: '800' },
  grandValue: { color: ORANGE, fontSize: 18, fontWeight: '900' },
  closeBtn: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: ORANGE,
    ...ctaShadow(ORANGE),
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});

export default TaxBreakdownModal;
