import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { NavigationHeader } from '@components/Header';

// Helper to display numbers cleanly without floating point artifacts
const displayNum = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return parseFloat(num.toPrecision(12)).toString();
};

const CreateInvoicePreview = ({ navigation, route }) => {
  const params = route?.params || {};
  const customer = params.customer || params.partner || params.partnerInfo || null;
  // Support multiple shapes used across the app: { items, subtotal, tax, service, total }
  // and legacy/vending: { products, totalAmount }
  const rawItems = params.items || params.products || [];
  // Normalize items: ensure qty, unit/price, discount_percent, subtotal present
  const items = Array.isArray(rawItems) ? rawItems.map((it) => {
    const qty = Number(it.qty ?? it.quantity ?? it.quantity_available ?? 1);
    const price = Number(it.price ?? it.unit ?? it.price_unit ?? it.list_price ?? 0);
    const grossTotal = price * qty;
    // Use fixed discount_amount from item if present, otherwise fall back to percentage calculation
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
      subtotal: typeof it.subtotal !== 'undefined' ? Number(it.subtotal) : netTotal
    };
  }) : [];

  const subtotal = typeof params.subtotal !== 'undefined' ? Number(params.subtotal) : (typeof params.totalAmount !== 'undefined' ? Number(params.totalAmount) : items.reduce((s, it) => s + (it.subtotal || 0), 0));
  const tax = typeof params.tax !== 'undefined' ? Number(params.tax) : 0;
  const service = typeof params.service !== 'undefined' ? Number(params.service) : 0;
  // Discount in Rs (absolute value, not percentage)
  const discount = typeof params.discount !== 'undefined' ? Number(params.discount) : 0;
  const total = typeof params.total !== 'undefined' ? Number(params.total) : subtotal + tax + service - discount;
  const orderId = params.orderId || params.id || params.invoiceId || null;

  const grandTotal = total;
  const totalQty = items.reduce((sum, item) => sum + (item.qty || item.quantity || 0), 0);
  // Payment amounts: accept multiple param names used across screens
  const paidAmount = typeof params.amount !== 'undefined' ? Number(params.amount) : (typeof params.paid !== 'undefined' ? Number(params.paid) : (typeof params.paymentAmount !== 'undefined' ? Number(params.paymentAmount) : 0));
  const cashDisplay = paidAmount > 0 ? paidAmount : grandTotal;
  const changeAmount = paidAmount > grandTotal ? (paidAmount - grandTotal) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <NavigationHeader title="Invoice Preview" onBackPress={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.invoiceBox}>
          <View style={{ height: 8 }} />
          
          {/* Customer Details (if selected) */}
          {customer && (
            <View style={{ borderWidth: 1, borderColor: '#ddd', padding: 4, marginBottom: 8 }}>
              <Text style={{ fontWeight: '800', textAlign: 'center', paddingVertical: 6 }}>Customer Details / تفاصيل</Text>
              <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13 }}>Name / الاسم:</Text>
                  <Text style={{ fontWeight: '700' }}>{customer.name || customer.display_name || customer.partner_name || ''}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13 }}>Phone / الهاتف:</Text>
                  <Text style={{ fontWeight: '700' }}>{customer.phone || customer.mobile || customer.phone_number || ''}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Invoice Info */}
          <Text style={styles.invoiceNo}>No: {String(orderId || '000002').padStart(6, '0')}</Text>
          <Text style={styles.dateText}>Date: {new Date().toLocaleDateString('en-GB')}</Text>
          <Text style={styles.cashier}>Cashier: Admin</Text>
          
          {/* Product Table */}
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, { flex: 2 }]}>Product Name{'\n'}اسم المنتج</Text>
              <Text style={[styles.headerCell, { flex: 0.6 }]}>Qty{'\n'}كمية</Text>
              <Text style={[styles.headerCell, { flex: 0.9 }]}>Unit{'\n'}سعر</Text>
              <Text style={[styles.headerCell, { flex: 0.9 }]}>Disc{'\n'}خصم</Text>
              <Text style={[styles.headerCell, { flex: 0.9 }]}>Total{'\n'}المجموع</Text>
            </View>

            {items.map((item, idx) => {
              const itemQty = item.qty || item.quantity || 1;
              const itemPrice = item.price || item.unit || item.price_unit || 0;
              const itemDiscount = item.discount_amount || 0;
              const itemTotal = item.subtotal || ((itemPrice * itemQty) - itemDiscount);

              return (
                <View key={idx} style={styles.productItem}>
                  <Text style={styles.productNumber}>{idx + 1}.</Text>
                  <View style={styles.productRow}>
                    <Text style={[styles.productCell, { flex: 2 }]}>{item.name || 'Product'}</Text>
                    <Text style={[styles.productCell, { flex: 0.6, textAlign: 'center' }]}>{itemQty}</Text>
                    <Text style={[styles.productCell, { flex: 0.9, textAlign: 'right' }]}>{displayNum(itemPrice)}</Text>
                    <Text style={[styles.productCell, { flex: 0.9, textAlign: 'right' }]}>{itemDiscount > 0 ? `-${displayNum(itemDiscount)}` : '0'}</Text>
                    <Text style={[styles.productCell, { flex: 0.9, textAlign: 'right' }]}>{displayNum(itemTotal)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          
          <View style={styles.divider} />
          
          {/* Totals */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal / المجموع الفرعي</Text>
            <Text style={styles.totalValue}>{displayNum(subtotal || total)}</Text>
          </View>

          {discount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount / الخصم</Text>
              <Text style={[styles.totalValue, { color: '#c00' }]}>-{displayNum(discount)}</Text>
            </View>
          )}

          <View style={styles.dividerThick} />

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total / الإجمالي:</Text>
            <Text style={styles.grandTotalValue}>{displayNum(grandTotal)}</Text>
          </View>

          <View style={styles.dividerThick} />

          {/* Payment Details */}
          <Text style={styles.paymentTitle}>Payment Details / تفاصيل الدفع</Text>

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Cash:</Text>
            <Text style={styles.paymentValue}>{displayNum(cashDisplay)}</Text>
          </View>

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Change / الباقي:</Text>
            <Text style={styles.paymentValue}>{displayNum(changeAmount)}</Text>
          </View>
          
          <View style={styles.divider} />
        </View>

        <View style={{ marginTop: 16 }}>
          <TouchableOpacity 
            onPress={async () => {
              try {
                  const html = generateInvoiceHtml({ items, subtotal, tax, service, total, discount, orderId, paidAmount, customer });
                const { uri } = await Print.printToFileAsync({ html });
                if (!uri) throw new Error('Failed to generate PDF');
                await Sharing.shareAsync(uri);
              } catch (err) {
                console.error('Print/share error', err);
              }
            }} 
            style={{ backgroundColor: '#111827', paddingVertical: 14, borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Print / Share Invoice</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// Rich HTML generator to mimic Odoo POS receipt (80mm thermal, bilingual layout, dotted separators)
const generateInvoiceHtml = ({ items = [], subtotal = 0, tax = 0, service = 0, total = 0, discount = 0, orderId = '', paidAmount = 0, customer = null } = {}) => {
  // Helper to display numbers cleanly in HTML
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
    // render product name on its own line and a small unit line (e.g., KG) below like the Odoo receipt
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

const styles = StyleSheet.create({
  container: { 
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  invoiceBox: { 
    backgroundColor: '#fff', 
    borderRadius: 4,
    padding: 20,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  companyArabic: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  companyDetails: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 8,
  },
  dividerThick: {
    height: 2,
    backgroundColor: '#000',
    marginVertical: 10,
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 8,
  },
  invoiceNo: {
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  cashier: {
    fontSize: 13,
    textAlign: 'left',
    marginBottom: 8,
  },
  tableContainer: {
    marginTop: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 6,
    marginBottom: 8,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  productItem: {
    marginBottom: 12,
  },
  productNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productCell: {
    fontSize: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 13,
  },
  totalValue: {
    fontSize: 13,
    textAlign: 'right',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 8,
    textDecorationLine: 'underline',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  paymentLabel: {
    fontSize: 13,
  },
  paymentValue: {
    fontSize: 13,
    textAlign: 'right',
  },
  totalQtyText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 6,
  },
  footer: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
  footerArabic: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});

export default CreateInvoicePreview;
