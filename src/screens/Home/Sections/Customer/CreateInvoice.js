
import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, Image, ActivityIndicator, Alert } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { useProductStore } from '@stores/product';
import { COLORS } from '@constants/theme';
import { createInvoiceOdoo, linkInvoiceToPosOrderOdoo, fetchFieldSelectionOdoo } from '@api/services/generalApi';

// Helper to display numbers cleanly without floating point artifacts
const displayNum = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return parseFloat(num.toPrecision(12)).toString();
};

const CreateInvoice = ({ navigation, route }) => {
  const cart = useProductStore((s) => s.getCurrentCart()) || [];
  const [loading, setLoading] = useState(false);

  const items = useMemo(() => cart.map(it => {
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unit = Number(it.price_unit ?? it.price ?? 0);
    // If price_subtotal_incl or price_subtotal already exists, use it (already calculated)
    // Otherwise calculate from unit price * quantity
    let subtotal;
    if (typeof it.price_subtotal_incl === 'number' && !isNaN(it.price_subtotal_incl)) {
      subtotal = it.price_subtotal_incl; // Already includes quantity
    } else if (typeof it.price_subtotal === 'number' && !isNaN(it.price_subtotal)) {
      subtotal = it.price_subtotal; // Already includes quantity
    } else {
      subtotal = unit * qty; // Calculate from unit price
    }
    return {
      id: String(it.id),
      qty,
      name: it.name || (it.product_id && it.product_id[1]) || 'Product',
      unit,
      subtotal,
      discount_amount: Number(it.discount_amount || 0),
    };
  }), [cart]);

  const subtotal = useMemo(() => items.reduce((s, it) => s + (it.subtotal || 0), 0), [items]);
  const tax = subtotal * 0.00; // placeholder tax 0%
  const service = subtotal * 0.00; // placeholder service charge
  const total = subtotal + tax + service;

  const renderLine = ({ item, index }) => (
    <View key={item.id} style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: index === items.length - 1 ? 0 : 1, borderColor: '#f0f0f0' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Text style={{ fontWeight: '700', marginRight: 12, width: 28 }}>{item.qty}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700' }}>{item.name}</Text>
        </View>
      </View>
      <View style={{ width: 120, alignItems: 'flex-end' }}>
        <Text style={{ fontWeight: '700' }}>{displayNum(item.subtotal || (item.unit * item.qty))}</Text>
        <Text style={{ fontSize: 12, color: '#666' }}>{`@ ${displayNum(item.unit)}`}</Text>
      </View>
    </View>
  );

  // Save Invoice handler
  const handleSaveInvoice = async () => {
    if (!cart.length) {
      Alert.alert('No items', 'There are no items to invoice.');
      return;
    }
    setLoading(true);
    try {
      // For demo: use first product's partner_id if present, else fallback
      const partnerId = cart[0]?.partner_id || 1; // TODO: Replace 1 with actual customer selection
      // Map cart items to Odoo invoice line format, validate IDs
      const products = cart.map(it => {
        // Validate product_id is integer
        let productId = it.id;
        if (typeof productId === 'string') productId = parseInt(productId, 10);
        if (isNaN(productId)) productId = null;
        // Validate tax_ids are array of integers
        let taxIds = Array.isArray(it.tax_ids) ? it.tax_ids.map(tid => typeof tid === 'string' ? parseInt(tid, 10) : tid).filter(Number.isInteger) : [];
        // Optionally validate account_id if present (not used here)
        return {
          id: productId,
          name: it.name,
          quantity: Number(it.quantity ?? it.qty ?? 1),
          price_unit: Number(it.price_unit ?? it.price ?? 0),
          discount: Number(it.discount ?? it.discount_percent ?? 0),
          tax_ids: taxIds,
        };
      });
      // Log payload for debugging
      console.log('[INVOICE DEBUG] Payload to Odoo:', { partnerId, products });
      // Always include today's date as invoiceDate
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const invoiceDate = `${yyyy}-${mm}-${dd}`;
      const result = await createInvoiceOdoo({ partnerId, products, invoiceDate });
      setLoading(false);
      if (result && result.id) {
          Alert.alert('Invoice Saved', `Invoice #${result.id} has been saved${result.posted ? ' and posted' : ''}.`, [
          { text: 'OK', onPress: () => navigation.navigate('CreateInvoicePreview', { items, subtotal, tax, service, total, orderId: result.id, customer: route?.params?.customer || null }) }
        ]);
          console.log('[CREATE INVOICE] Linking invoice to order', { orderId: route.params.orderId, invoiceId: result.id });
          // Log the order id explicitly
          console.log('[CREATE INVOICE] POS Order ID:', route.params.orderId);
          // Fetch available states for pos.order and log them before updating
          try {
            const states = await fetchFieldSelectionOdoo({ model: 'pos.order', field: 'state' });
            console.log('[CREATE INVOICE] Available pos.order states:', states);
          } catch (sErr) {
            console.warn('[CREATE INVOICE] Failed to fetch pos.order states:', sErr);
          }
          // Decide target POS order state based on invoice status
          try {
            const invoiceState = result?.invoiceStatus?.state;
            let targetState = 'invoiced';
            if (invoiceState === 'posted') {
              // Prefer 'done' if available in the selection list
              const selectionValues = (await fetchFieldSelectionOdoo({ model: 'pos.order', field: 'state' })) || [];
              const available = selectionValues.map(s => s[0]);
              if (available.includes('done')) targetState = 'done';
              else targetState = 'invoiced';
            }
            console.log('[CREATE INVOICE] Will set POS order state to:', targetState);
            const linkResp = await linkInvoiceToPosOrderOdoo({ orderId: route.params.orderId, invoiceId: result.id, setState: true, state: targetState });
            console.log('[CREATE INVOICE] linkResp:', linkResp);
          } catch (linkErr) {
            console.warn('[CREATE INVOICE] Failed to link invoice to order:', linkErr);
          }
      } else {
        Alert.alert('Error', 'Failed to save invoice.');
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to save invoice.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <NavigationHeader title="Invoice" onBackPress={() => navigation.goBack()} />

      <View style={{ padding: 16 }}>
        <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image source={require('@assets/images/logo/logo.png')} style={{ width: 48, height: 48, resizeMode: 'contain', marginRight: 12 }} />
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800' }}>My Restaurant</Text>
                <Text style={{ color: '#6b7280' }}>123 Main St, City</Text>
                <Text style={{ color: '#6b7280' }}>Phone: (123) 456-7890</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, fontWeight: '800' }}>Invoice</Text>
              <Text style={{ color: '#6b7280' }}>{`#${route?.params?.orderId || '—'}`}</Text>
              <Text style={{ color: '#6b7280' }}>{new Date().toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#fafafa' }}>
            <Text style={{ fontWeight: '800' }}>Items</Text>
          </View>
          <FlatList
            data={items}
            keyExtractor={i => i.id}
            renderItem={renderLine}
            ListEmptyComponent={<View style={{ padding: 24 }}><Text style={{ color: '#666' }}>No items to invoice</Text></View>}
            contentContainerStyle={{}}
          />

          <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#6b7280' }}>Subtotal</Text>
              <Text style={{ fontWeight: '800' }}>{displayNum(subtotal)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#6b7280' }}>Service</Text>
              <Text style={{ fontWeight: '800' }}>{displayNum(service)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#6b7280' }}>Tax</Text>
              <Text style={{ fontWeight: '800' }}>{displayNum(tax)}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: '#efefef', marginVertical: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '900' }}>Total</Text>
              <Text style={{ fontSize: 20, fontWeight: '900' }}>{displayNum(total)}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <TouchableOpacity onPress={handleSaveInvoice} style={{ backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{loading ? 'Saving...' : 'Save Invoice'}</Text>
          </TouchableOpacity>
          {loading && <ActivityIndicator style={{ marginTop: 12 }} color={COLORS.primary || '#111827'} />}
        </View>
      </View>
    </SafeAreaView>
  );
};

export default CreateInvoice;
