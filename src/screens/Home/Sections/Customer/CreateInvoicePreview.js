import React, { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, StatusBar, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { useProductStore } from '@stores/product';

const NAVY = '#2E294E';
const ORANGE = '#F47B20';

// Helper to display numbers cleanly without floating point artifacts
const displayNum = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return parseFloat(num.toPrecision(12)).toString();
};

const CreateInvoicePreview = ({ navigation, route }) => {
  const params = route?.params || {};
  const { clearProducts } = useProductStore();

  // Done = wipe the in-memory cart and reset navigation to the Home tab.
  // Used both by the explicit "Done" button and the back-arrow in the hero.
  const onDone = () => {
    try { clearProducts(); } catch (_) {}
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'AppNavigator' }] })
    );
  };

  // Hardware / gesture back → run the same Done flow instead of letting the
  // navigator pop back to the Payment screen.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onDone();
        return true; // we handled it — stop the default pop
      });
      return () => sub.remove();
    }, [])
  );
  const customer = params.customer || params.partner || params.partnerInfo || null;
  // Support multiple shapes used across the app
  const rawItems = params.items || params.products || [];
  const items = Array.isArray(rawItems) ? rawItems.map((it) => {
    const qty = Number(it.qty ?? it.quantity ?? it.quantity_available ?? 1);
    const price = Number(it.price ?? it.unit ?? it.price_unit ?? it.list_price ?? 0);
    const grossTotal = price * qty;
    const discountAmount = Number(it.discount_amount || 0) || (grossTotal * Number(it.discount_percent ?? it.discount ?? 0) / 100);
    const discountPercent = grossTotal > 0 ? (discountAmount / grossTotal) * 100 : 0;
    const netTotal = grossTotal - discountAmount;
    return {
      id: it.id ?? it.remoteId ?? it.product_id ?? null,
      name: it.name ?? it.product_name ?? it.product?.name ?? 'Product',
      qty,
      price,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      subtotal: typeof it.subtotal !== 'undefined' ? Number(it.subtotal) : netTotal,
    };
  }) : [];

  const subtotal = typeof params.subtotal !== 'undefined' ? Number(params.subtotal) : (typeof params.totalAmount !== 'undefined' ? Number(params.totalAmount) : items.reduce((s, it) => s + (it.subtotal || 0), 0));
  const tax = typeof params.tax !== 'undefined' ? Number(params.tax) : 0;
  const service = typeof params.service !== 'undefined' ? Number(params.service) : 0;
  const discount = typeof params.discount !== 'undefined' ? Number(params.discount) : 0;
  const total = typeof params.total !== 'undefined' ? Number(params.total) : subtotal + tax + service - discount;
  const orderId = params.orderId || params.id || params.invoiceId || null;

  const grandTotal = total;
  const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const paidAmount = typeof params.amount !== 'undefined' ? Number(params.amount) : (typeof params.paid !== 'undefined' ? Number(params.paid) : (typeof params.paymentAmount !== 'undefined' ? Number(params.paymentAmount) : 0));
  const cashDisplay = paidAmount > 0 ? paidAmount : grandTotal;
  const changeAmount = paidAmount > grandTotal ? (paidAmount - grandTotal) : 0;

  const orderNumber = String(orderId || '000002').padStart(6, '0');
  const dateStr = new Date().toLocaleDateString('en-GB');
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const onPrintShare = async () => {
    try {
      const html = generateInvoiceHtml({ items, subtotal, tax, service, total, discount, orderId, paidAmount, customer });
      const { uri } = await Print.printToFileAsync({ html });
      if (!uri) throw new Error('Failed to generate PDF');
      await Sharing.shareAsync(uri);
    } catch (err) {
      console.error('Print/share error', err);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: NAVY }} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* Hero header — flat navy, no gloss/two-tone */}
      <View style={s.hero}>
        <View style={s.heroTop}>
          <TouchableOpacity
            onPress={onDone}
            style={s.heroIconBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.heroTitle}>Invoice</Text>
          <View style={s.heroSpacer} />
        </View>

        <View style={s.successDisk}>
          <MaterialIcons name="check" size={36} color="#fff" />
        </View>
        <Text style={s.successText}>Order Placed</Text>
        <Text style={s.orderRef}>#{orderNumber}</Text>
      </View>

      <View style={s.surface}>
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Date / time strip — no cashier */}
          <View style={s.metaStrip}>
            <View style={s.metaCell}>
              <View style={s.metaIconDisk}>
                <MaterialIcons name="event" size={16} color={NAVY} />
              </View>
              <View style={{ marginLeft: 8 }}>
                <Text style={s.metaCaption}>DATE</Text>
                <Text style={s.metaValue}>{dateStr}</Text>
              </View>
            </View>
            <View style={s.metaSep} />
            <View style={s.metaCell}>
              <View style={s.metaIconDisk}>
                <MaterialIcons name="access-time" size={16} color={NAVY} />
              </View>
              <View style={{ marginLeft: 8 }}>
                <Text style={s.metaCaption}>TIME</Text>
                <Text style={s.metaValue}>{timeStr}</Text>
              </View>
            </View>
          </View>

          {/* Plain paper-receipt preview — black on white, mirrors the print output */}
          <View style={s.paperOuter}>
            <Text style={s.paperSectionLabel}>RECEIPT PREVIEW</Text>
            <View style={s.paperSheet}>
              {/* Company header */}
              <Text style={s.paperCompany}>Multaqa Al-Hadhara Trading L.L.C.</Text>
              <Text style={s.paperMetaLine}>CR No: 1202389</Text>
              <Text style={s.paperMetaLine}>Muscat, Oman</Text>
              <Text style={s.paperMetaLine}>99881702, 93686812</Text>

              <View style={s.paperRule} />

              {/* INVOICE title block */}
              <View style={s.paperTitleBox}>
                <Text style={s.paperTitle}>INVOICE / فاتورة</Text>
              </View>

              {/* Customer block */}
              {customer ? (
                <View style={s.paperCustomerBox}>
                  <Text style={s.paperCustomerHeader}>Customer Details / تفاصيل</Text>
                  <View style={s.paperCustomerRow}>
                    <Text style={s.paperPlain}>Name / الاسم:</Text>
                    <Text style={s.paperPlainBold} numberOfLines={1}>
                      {customer.name || customer.display_name || customer.partner_name || ''}
                    </Text>
                  </View>
                  {(customer.phone || customer.mobile || customer.phone_number) ? (
                    <View style={s.paperCustomerRow}>
                      <Text style={s.paperPlain}>Phone / الهاتف:</Text>
                      <Text style={s.paperPlainBold}>
                        {customer.phone || customer.mobile || customer.phone_number}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Meta — No / Date / Cashier */}
              <View style={s.paperMetaRow}>
                <Text style={[s.paperPlain, { flex: 1, textAlign: 'left' }]}>No: {orderNumber}</Text>
                <Text style={[s.paperPlain, { flex: 1, textAlign: 'center' }]}>Date: {dateStr}</Text>
                <Text style={[s.paperPlain, { flex: 1, textAlign: 'right' }]}>Cashier: Admin</Text>
              </View>

              {/* Items table */}
              <View style={s.paperTableHead}>
                <Text style={[s.paperHeadCell, { flex: 0.4 }]}>#</Text>
                <Text style={[s.paperHeadCell, { flex: 2 }]}>Product</Text>
                <Text style={[s.paperHeadCell, { flex: 0.6, textAlign: 'center' }]}>Qty</Text>
                <Text style={[s.paperHeadCell, { flex: 0.9, textAlign: 'right' }]}>Unit</Text>
                <Text style={[s.paperHeadCell, { flex: 0.9, textAlign: 'right' }]}>Disc</Text>
                <Text style={[s.paperHeadCell, { flex: 1, textAlign: 'right' }]}>Total</Text>
              </View>
              {items.map((item, idx) => {
                const itemTotal = item.subtotal || ((item.price * item.qty) - (item.discount_amount || 0));
                return (
                  <View key={idx}>
                    <View style={s.paperRow}>
                      <Text style={[s.paperPlain, { flex: 0.4 }]}>{idx + 1}.</Text>
                      <Text style={[s.paperPlain, { flex: 2 }]} numberOfLines={1}>{item.name || 'Product'}</Text>
                      <Text style={[s.paperPlain, { flex: 0.6, textAlign: 'center' }]}>{item.qty}</Text>
                      <Text style={[s.paperPlain, { flex: 0.9, textAlign: 'right' }]}>{displayNum(item.price)}</Text>
                      <Text style={[s.paperPlain, { flex: 0.9, textAlign: 'right' }]}>
                        {item.discount_amount > 0 ? `-${displayNum(item.discount_amount)}` : '0'}
                      </Text>
                      <Text style={[s.paperPlain, { flex: 1, textAlign: 'right' }]}>{displayNum(itemTotal)}</Text>
                    </View>
                    {idx < items.length - 1 ? <View style={s.paperDottedRule} /> : null}
                  </View>
                );
              })}

              <View style={[s.paperDottedRule, { marginTop: 6 }]} />

              {/* Totals */}
              <View style={s.paperTotalsRow}>
                <Text style={s.paperPlain}>Subtotal / المجموع الفرعي</Text>
                <Text style={s.paperPlainBold}>{displayNum(subtotal || total)}</Text>
              </View>
              {tax > 0 ? (
                <View style={s.paperTotalsRow}>
                  <Text style={s.paperPlain}>Tax</Text>
                  <Text style={s.paperPlainBold}>{displayNum(tax)}</Text>
                </View>
              ) : null}
              {service > 0 ? (
                <View style={s.paperTotalsRow}>
                  <Text style={s.paperPlain}>Service</Text>
                  <Text style={s.paperPlainBold}>{displayNum(service)}</Text>
                </View>
              ) : null}
              {discount > 0 ? (
                <View style={s.paperTotalsRow}>
                  <Text style={s.paperPlain}>Discount / الخصم</Text>
                  <Text style={s.paperPlainBold}>-{displayNum(discount)}</Text>
                </View>
              ) : null}

              <View style={s.paperHeavyRule} />
              <View style={s.paperTotalsRow}>
                <Text style={s.paperGrandLabel}>Grand Total / الإجمالي</Text>
                <Text style={s.paperGrandValue}>{displayNum(grandTotal)}</Text>
              </View>

              <View style={s.paperRule} />

              {/* Payment */}
              <Text style={s.paperPaymentTitle}>Payment Details / تفاصيل الدفع</Text>
              <View style={s.paperTotalsRow}>
                <Text style={s.paperPlain}>Cash:</Text>
                <Text style={s.paperPlainBold}>{displayNum(cashDisplay)}</Text>
              </View>
              <View style={s.paperTotalsRow}>
                <Text style={s.paperPlain}>Change / الباقي:</Text>
                <Text style={s.paperPlainBold}>{displayNum(changeAmount)}</Text>
              </View>

              <View style={[s.paperDottedRule, { marginTop: 8 }]} />

              {/* Footer */}
              <Text style={s.paperFooter}>Thank you for your purchase!</Text>
              <Text style={[s.paperFooter, { fontSize: 11 }]}>شكرا لشرائك!</Text>
            </View>
          </View>

          {/* Thank you footer */}
          <View style={s.thankYou}>
            <MaterialCommunityIcons name="hand-heart" size={22} color={ORANGE} />
            <Text style={s.thankYouText}>Thank you for your purchase!</Text>
            <Text style={s.thankYouSub}>شكرا لشرائك</Text>
          </View>
        </ScrollView>

        {/* Sticky bottom action — Done + Print row */}
        <View style={s.footer}>
          <View style={s.footerRow}>
            <TouchableOpacity
              onPress={onDone}
              activeOpacity={0.85}
              style={s.doneBtn}
            >
              <MaterialIcons name="check" size={18} color={NAVY} />
              <Text style={s.doneText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onPrintShare} activeOpacity={0.85} style={s.printBtn}>
              <View style={s.printIconDisk}>
                <MaterialCommunityIcons name="printer" size={18} color={ORANGE} />
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={s.printText}>Print Invoice</Text>
                <Text style={s.printSub}>Save · Share PDF</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

// Rich HTML generator — UNCHANGED. Keeps the exact 80-mm thermal-receipt
// layout the user already had (bilingual, dotted separators, RTL).
const generateInvoiceHtml = ({ items = [], subtotal = 0, tax = 0, service = 0, total = 0, discount = 0, orderId = '', paidAmount = 0, customer = null } = {}) => {
  const formatCurrencyHtml = (amount) => {
    const num = Number(amount);
    if (isNaN(num)) return '0';
    return parseFloat(num.toPrecision(12)).toString();
  };

  const rows = items.map((item, idx) => {
    const itemQty = item.qty || item.quantity || 1;
    const itemPrice = item.price || item.unit || item.price_unit || 0;
    const discountPercent = Number(item.discount_percent || item.discount || 0);
    const grossTotal = itemPrice * itemQty;
    const itemDiscount = item.discount_amount || (grossTotal * discountPercent / 100);
    const itemTotal = item.subtotal ?? (grossTotal - itemDiscount);
    const nameEsc = escapeHtml(item.name || 'Product');
    return `<tr>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${formatCurrencyHtml(itemTotal)}</span></td>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${itemDiscount > 0 ? '-' + formatCurrencyHtml(itemDiscount) : '0'}</span></td>
      <td style="padding:6px 4px; text-align:right; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${formatCurrencyHtml(itemPrice)}</span></td>
      <td style="padding:6px 4px; text-align:center; vertical-align:top;"><span style="direction:ltr; unicode-bidi:embed;">${itemQty}</span></td>
      <td style="padding:6px 4px; vertical-align:top;">${nameEsc}<div style="font-size:10px; color:#333; margin-top:4px;">KG</div></td>
      <td style="padding:6px 4px; vertical-align:top;">${idx + 1}.</td>
    </tr>
    <tr><td colspan="6" style="border-bottom:1px dotted #000; height:6px;">&nbsp;</td></tr>`;
  }).join('');

  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Invoice</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      html,body { margin:0; padding:0; }
      .receipt { width:72mm; margin:0 auto; box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; color:#111; direction: rtl; }
      .header { text-align:center; font-size:11px; }
      .header .company { font-weight:700; font-size:13px; }
      .hr { border-top:1px solid #999; margin:10px 0; }
      .titleBox { border-top:2px solid #000; border-bottom:2px solid #000; padding:6px 0; margin:8px 0; text-align:center; font-weight:700; }
      .meta { font-size:11px; margin-bottom:6px; }
      table { width:100%; border-collapse:collapse; font-size:11px; }
      th { font-weight:700; font-size:11px; padding:6px 4px; text-align:center; border-bottom:1px solid #000; }
      td { font-size:11px; padding:6px 4px; }
      .numCol { width:5%; }
      .prodCol { width:40%; }
      .qtyCol { width:10%; text-align:center; }
      .unitCol { width:15%; text-align:right; }
      .discCol { width:15%; text-align:right; }
      .totalCol { width:15%; text-align:right; }
      .divider-dotted { border-bottom:1px dotted #000; margin:8px 0; }
      .totals { margin-top:6px; }
      .totals .line { display:flex; justify-content:space-between; font-size:12px; padding:4px 0; }
      .totals .label { font-weight:400; }
      .totals .value { font-weight:700; }
      .paymentTitle { font-weight:700; text-decoration:underline; margin-top:8px; padding-top:6px; }
      .paymentRow { display:flex; justify-content:space-between; padding:4px 0; }
      .footer { text-align:center; font-size:11px; margin-top:8px; }
    </style>
  </head>
  <body>
    <div class="receipt" style="padding:4mm 4mm;">
      <div class="header">
        <div class="company">Multaqa Al-Hadhara Trading L.L.C.</div>
        <div class="meta">CR No: 1202389</div>
        <div class="meta">Muscat, Oman</div>
        <div class="meta">99881702, 93686812</div>
      </div>

      <div class="hr"></div>

      <div class="titleBox">INVOICE / فاتورة</div>

      ${customer ? `<div style="border:1px solid #ddd; padding:6px; margin:6px 0; font-size:11px;">
        <div style="text-align:center; font-weight:700; padding-bottom:6px;">Customer Details / تفاصيل</div>
        <table style="width:100%; font-size:11px; direction:ltr;">
          <tr>
            <td style="width:70%; text-align:left;">Name / الاسم:</td>
            <td style="text-align:right; font-weight:700;">${escapeHtml(customer?.name || customer?.display_name || customer?.partner_name || '')}</td>
          </tr>
          <tr>
            <td style="text-align:left;">Phone / الهاتف:</td>
            <td style="text-align:right; font-weight:700;">${escapeHtml(customer?.phone || customer?.mobile || customer?.phone_number || '')}</td>
          </tr>
        </table>
      </div>` : ''}

      <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:6px;">
        <div style="text-align:left; direction:ltr;">No: ${String(orderId || '').padStart(6,'0')}</div>
        <div style="text-align:center">Date: ${new Date().toLocaleDateString('en-GB')}</div>
        <div style="text-align:right">Cashier: Admin</div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="totalCol">Total<br/><span style="font-weight:400;font-size:10px;">المجموع</span></th>
            <th class="discCol">Disc<br/><span style="font-weight:400;font-size:10px;">خصم</span></th>
            <th class="unitCol">Unit<br/><span style="font-weight:400;font-size:10px;">سعر</span></th>
            <th class="qtyCol">Qty<br/><span style="font-weight:400;font-size:10px;">كمية</span></th>
            <th class="prodCol">Product<br/><span style="font-weight:400;font-size:10px;">المنتج</span></th>
            <th class="numCol">#</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="divider-dotted"></div>

      <div class="totals">
        <div class="line"><div class="label">Subtotal / المجموع الفرعي</div><div class="value">${formatCurrencyHtml(Number(subtotal || total))}</div></div>
        ${discount > 0 ? `<div class="line"><div class="label">Discount / الخصم</div><div class="value" style="color:#c00;">-${formatCurrencyHtml(discount)}</div></div>` : ''}
        <div style="height:6px; border-bottom:2px solid #000; margin-top:6px;"></div>
        <div class="line" style="font-size:13px; font-weight:700;"><div class="label">Grand Total / الإجمالي</div><div class="value">${formatCurrencyHtml(Number(total || subtotal))}</div></div>
      </div>

      <div style="border-top:1px solid #000; margin-top:8px; padding-top:6px;"></div>
      <div class="paymentTitle">Payment Details / تفاصيل الدفع</div>
      <div class="paymentRow"><div>Cash:</div><div>${formatCurrencyHtml(Number(paidAmount > 0 ? paidAmount : (total || subtotal)))}</div></div>
      <div class="paymentRow"><div>Change / الباقي:</div><div>${formatCurrencyHtml(Number((paidAmount > (total || subtotal) ? (paidAmount - (total || subtotal)) : 0)))}</div></div>

      <div style="height:8px; border-bottom:1px dotted #000; margin-top:8px;"></div>
      <div class="footer">Thank you for your purchase!<br/>شكرا لشرائك!</div>
    </div>
  </body>
  </html>`;

  return html;
};

const escapeHtml = (unsafe) => {
  return String(unsafe).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
  });
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 3 },
});

const ctaShadow = (color) => Platform.select({
  ios: { shadowColor: color, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 7 },
});

const s = StyleSheet.create({
  // Hero
  hero: {
    backgroundColor: NAVY,
    paddingTop: 6,
    paddingBottom: 56,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginBottom: 18 },
  heroIconBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroSpacer: {
    width: 32, height: 32,
    backgroundColor: 'transparent',
  },
  heroTitle: {
    flex: 1, color: '#fff', fontSize: 16, fontWeight: '800',
    textAlign: 'center', letterSpacing: 0.4,
  },
  successDisk: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#10b981',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 10,
  },
  successText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  orderRef: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 3 },

  // Surface
  surface: {
    flex: 1, backgroundColor: '#f6f7fb',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    marginTop: -22,
  },

  // Meta strip
  metaStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 12,
    marginBottom: 12,
    ...cardShadow,
  },
  metaCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  metaIconDisk: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#eef0f5',
    alignItems: 'center', justifyContent: 'center',
  },
  metaCaption: {
    color: '#8896ab', fontSize: 10, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2,
  },
  metaValue: { color: NAVY, fontSize: 13, fontWeight: '800' },
  metaSep: { width: 1, height: 32, backgroundColor: '#eef0f5', marginHorizontal: 8 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    ...cardShadow,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardHeaderIcon: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  cardTitle: { fontSize: 13, fontWeight: '800', color: NAVY, letterSpacing: 0.3 },
  qtyChip: { backgroundColor: '#fff7ed', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  qtyChipText: { color: '#9a3412', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  // Key-value rows
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  kvLabel: { color: '#8896ab', fontSize: 12, fontWeight: '600' },
  kvValue: { color: NAVY, fontSize: 13, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  kvDivider: { height: 1, backgroundColor: '#f1f2f6' },

  // Items list
  emptyText: { color: '#9ca3af', fontSize: 12, fontWeight: '500', paddingVertical: 12, textAlign: 'center' },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#f1f2f6',
  },
  lineNumDisk: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#eef0f5',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  lineNumText: { color: NAVY, fontSize: 11, fontWeight: '800' },
  lineName: { color: NAVY, fontSize: 13, fontWeight: '800' },
  lineMeta: { color: '#8896ab', fontSize: 11, fontWeight: '600', marginTop: 2 },
  lineAmt: { color: NAVY, fontSize: 13, fontWeight: '900', marginLeft: 8 },

  // Total row (grand)
  totalDivider: { height: 1.5, backgroundColor: NAVY, marginTop: 8, marginBottom: 6 },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  grandTotalLabel: { color: NAVY, fontSize: 14, fontWeight: '800' },
  grandTotalValue: { color: ORANGE, fontSize: 22, fontWeight: '900', letterSpacing: 0.3 },

  // Payment card (navy)
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  payLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  payValue: { color: '#fff', fontSize: 14, fontWeight: '900' },
  payRowDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },

  // Plain paper-receipt preview — black on white, no colour
  paperOuter: {
    marginBottom: 12,
  },
  paperSectionLabel: {
    fontSize: 10, fontWeight: '700', color: '#8896ab',
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 6, marginLeft: 2,
  },
  paperSheet: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#d1d5db',
    paddingVertical: 14, paddingHorizontal: 14,
  },
  paperCompany: {
    fontSize: 13, fontWeight: '700', color: '#000',
    textAlign: 'center', marginBottom: 4,
  },
  paperMetaLine: {
    fontSize: 11, color: '#000', textAlign: 'center', marginBottom: 2,
  },
  paperRule: {
    height: 0, borderBottomWidth: 1, borderBottomColor: '#000',
    marginVertical: 8,
  },
  paperHeavyRule: {
    height: 0, borderBottomWidth: 2, borderBottomColor: '#000',
    marginVertical: 6,
  },
  paperDottedRule: {
    height: 0, borderBottomWidth: 1, borderBottomColor: '#000',
    borderStyle: 'dashed', marginTop: 4, marginBottom: 4,
  },
  paperTitleBox: {
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#000',
    paddingVertical: 6, marginVertical: 4,
  },
  paperTitle: {
    fontSize: 12, fontWeight: '700', color: '#000', textAlign: 'center',
  },
  paperCustomerBox: {
    borderWidth: 1, borderColor: '#000',
    paddingVertical: 6, paddingHorizontal: 8, marginVertical: 6,
  },
  paperCustomerHeader: {
    fontSize: 11, fontWeight: '700', color: '#000',
    textAlign: 'center', marginBottom: 4,
  },
  paperCustomerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 2,
  },
  paperMetaRow: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 6,
  },
  paperTableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: '#000',
    paddingBottom: 4, marginTop: 8, marginBottom: 4,
  },
  paperHeadCell: {
    fontSize: 11, fontWeight: '700', color: '#000',
  },
  paperRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4,
  },
  paperPlain: {
    fontSize: 11, color: '#000',
  },
  paperPlainBold: {
    fontSize: 11, fontWeight: '700', color: '#000',
  },
  paperTotalsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 3,
  },
  paperGrandLabel: {
    fontSize: 13, fontWeight: '700', color: '#000',
  },
  paperGrandValue: {
    fontSize: 13, fontWeight: '700', color: '#000',
  },
  paperPaymentTitle: {
    fontSize: 12, fontWeight: '700', color: '#000',
    textDecorationLine: 'underline', textAlign: 'center',
    marginTop: 4, marginBottom: 4,
  },
  paperFooter: {
    fontSize: 12, color: '#000', textAlign: 'center',
    marginTop: 4,
  },

  // Thank you
  thankYou: { alignItems: 'center', paddingVertical: 18 },
  thankYouText: { color: NAVY, fontSize: 14, fontWeight: '800', marginTop: 6 },
  thankYouSub: { color: '#8896ab', fontSize: 12, fontWeight: '600', marginTop: 2 },

  // Footer CTA
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12,
    backgroundColor: '#fff',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 12 },
    }),
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  doneBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: NAVY,
  },
  doneText: { color: NAVY, fontSize: 14, fontWeight: '800', marginLeft: 6, letterSpacing: 0.3 },
  printBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    ...ctaShadow(ORANGE),
  },
  printIconDisk: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  printText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  printSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '600', marginTop: 1 },
});

export default CreateInvoicePreview;
