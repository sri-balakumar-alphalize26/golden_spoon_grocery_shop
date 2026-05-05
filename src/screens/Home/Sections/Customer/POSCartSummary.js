import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { useProductStore } from '@stores/product';
import { fetchCustomersOdoo, fetchCustomerDetailsOdoo } from '@api/services/generalApi';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';

const POSCartSummary = ({ navigation, route }) => {
  const currency = useAuthStore((state) => state.currency);
  const {
    openingAmount,
    sessionId,
    registerId,
    registerName,
    userId,
    userName
  } = route?.params || {};
  const { getCurrentCart, clearProducts, setCurrentCustomer, addProduct, removeProduct, loadCustomerCart } = useProductStore();
  const errorImage = require('@assets/images/error/error.png');
  const products = getCurrentCart();
  const [customerModal, setCustomerModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    console.log('POSCartSummary params:', route?.params);
  }, []);

  const computeTotal = () => products.reduce((s, p) => s + ((p.price || 0) * (p.quantity || p.qty || 0)), 0);

  const handleCustomer = async () => {
    setCustomerModal(true);
    setLoadingCustomers(true);
    try {
      const list = await fetchCustomersOdoo({ limit: 50 });
      setCustomers(list);
    } catch (e) {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSelectCustomer = (customer) => {
    // Preserve current cart by moving it to the selected customer's cart
    try {
      const currentCart = getCurrentCart() || [];
      // loadCustomerCart will set the currentCustomerId and assign the cart data
      loadCustomerCart(customer.id, currentCart);
    } catch (e) {
      console.warn('Failed to migrate cart to selected customer', e);
      // fallback: just set current customer id
      setCurrentCustomer(customer.id);
    }
    setSelectedCustomer(customer);
    setCustomerModal(false);
  };

  const handleCheckout = async () => {
    let customerToPass = selectedCustomer;
    // If the user didn't select a customer in this session, try to use the store's currentCustomerId
    if (!customerToPass) {
      try {
        const { currentCustomerId } = useProductStore.getState();
        if (currentCustomerId && currentCustomerId !== 'pos_guest') {
          const fetched = await fetchCustomerDetailsOdoo(currentCustomerId);
          customerToPass = fetched || { id: currentCustomerId };
        }
      } catch (e) {
        console.warn('Failed to fetch customer details for checkout:', e);
      }
    }

    navigation.navigate('POSPayment', {
      openingAmount,
      sessionId,
      registerId,
      registerName,
      userId,
      userName,
      products,
      customer: customerToPass || null,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <NavigationHeader title="Cart" onBackPress={() => navigation.goBack()} />
      <View style={{ padding: 12, flex: 1, backgroundColor: '#fff' }}>
        {products && products.length > 0 ? (
          <FlatList
            data={products}
            keyExtractor={(i) => String(i.id)}
            renderItem={({ item }) => {
              const qty = Number(item.quantity || item.qty || 0);
              const price = Number(item.price || 0);
              const lineTotal = (qty * price).toFixed(2);
              const increase = () => {
                addProduct({ ...item, quantity: qty + 1, price });
              };
              const decrease = () => {
                if (qty <= 1) {
                  removeProduct(item.id);
                } else {
                  addProduct({ ...item, quantity: qty - 1, price });
                }
              };
              // normalize image source: support `data:` URIs, http URLs, or raw base64
              const rawImg = item.imageUrl || item.image_url || null;
              let imageSource = errorImage;
              if (rawImg) {
                if (typeof rawImg === 'string') {
                  if (rawImg.startsWith('data:') || rawImg.startsWith('http')) {
                    imageSource = { uri: rawImg };
                  } else if (rawImg.length > 100) {
                    // likely a base64 string without data: prefix
                    imageSource = { uri: `data:image/png;base64,${rawImg}` };
                  }
                } else if (rawImg.uri) {
                  imageSource = rawImg;
                }
              }

              return (
                  <View style={styles.line}>
                    <Image
                      source={imageSource}
                      style={styles.thumb}
                      resizeMode="cover"
                      onError={() => { /* fallback to errorImage automatically */ }}
                    />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.qty}>{qty} × {formatCurrency(price, currency || { symbol: '$', position: 'before' })}</Text>
                  </View>
                  <View style={styles.controls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={decrease}>
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyDisplay}>{qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={increase}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.lineTotal}>{formatCurrency(lineTotal, currency || { symbol: '$', position: 'before' })}</Text>
                </View>
              );
            }}
          />
        ) : (
          <Text style={{ color: '#666' }}>Cart is empty</Text>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(computeTotal(), currency || { symbol: '$', position: 'before' })}</Text>
        </View>

        {/* Customer selection removed from cart page. Now only available in payment page. */}

        <View style={{ marginTop: 12 }}>
          <Button title="Checkout / Payment" onPress={handleCheckout} />
        </View>

        <Modal visible={customerModal} animationType="slide" transparent={true}>
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Text style={{ fontWeight: '700', fontSize: 18, marginBottom: 12 }}>Select Customer</Text>
              {loadingCustomers ? (
                <ActivityIndicator size="large" color="#444" />
              ) : (
                <FlatList
                  data={customers}
                  keyExtractor={(i) => String(i.id)}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.customerItem} onPress={() => handleSelectCustomer(item)}>
                      <Text style={{ fontSize: 22, fontWeight: '700' }}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
              <Button title="Close" onPress={() => setCustomerModal(false)} />
            </View>
          </View>
        </Modal>

      </View>
    </SafeAreaView>
  );
};

export default POSCartSummary;

const styles = StyleSheet.create({
  line: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center' },
  name: { fontWeight: '700', fontSize: 22, color: '#111' },
  qty: { color: '#666', marginTop: 6, fontSize: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  qtyBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  qtyBtnText: { color: '#111', fontWeight: '700', fontSize: 22 },
  qtyDisplay: { color: '#111', marginHorizontal: 8, minWidth: 32, textAlign: 'center', fontWeight: '700', fontSize: 18 },
  lineTotal: { marginLeft: 8, fontWeight: '700', color: '#111' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderColor: '#f0f0f0' },
  totalLabel: { fontWeight: '800', fontSize: 20, color: '#111' },
  totalValue: { fontWeight: '800', fontSize: 24, color: '#111' },
  customerLabel: { fontWeight: '600', fontSize: 16, marginBottom: 6, color: '#111' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 12, width: '80%', maxHeight: '80%' },
  customerItem: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  thumb: { width: 48, height: 48, borderRadius: 6, marginRight: 12, backgroundColor: '#fff' },
});
