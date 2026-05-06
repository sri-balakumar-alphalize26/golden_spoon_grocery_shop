import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, TextInput, Pressable } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationHeader } from '@components/Header';
import { useProductStore } from '@stores/product';
import { COLORS } from '@constants/theme';
import { createPosOrderOdoo, fetchDiscountsOdoo, updatePosOrderOdoo } from '@api/services/generalApi';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from '@components/containers';

// Helper to display numbers cleanly without floating point artifacts
const displayNum = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return parseFloat(num.toPrecision(12)).toString();
};

const TakeoutDelivery = ({ navigation, route }) => {
  const cart = useProductStore((s) => s.getCurrentCart()) || [];
  const { addProduct, removeProduct, clearProducts, setProductDiscount } = useProductStore();
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [customDiscountInput, setCustomDiscountInput] = useState('');
  const [discountPresets, setDiscountPresets] = useState([]);
  const STORAGE_KEY = 'local_discount_presets_v1';
  const [lineDiscountModalVisible, setLineDiscountModalVisible] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [addName, setAddName] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [customer, setCustomer] = useState(null);
  const [lineDiscountInput, setLineDiscountInput] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState(null);
  const [submittedFingerprint, setSubmittedFingerprint] = useState(null);

  const openCustomerSelector = () => {
    navigation.navigate('CustomerScreen', {
      selectMode: true,
      onSelect: (selected) => {
        setCustomer(selected);
      },
    });
  };
  
  // map cart to items with qty and price
  const items = useMemo(() => cart.map(it => {
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unitPrice = Number(it.price_unit ?? it.price ?? 0);
    // If price_subtotal_incl or price_subtotal exists, use it directly (already includes qty)
    // Otherwise calculate: unit_price * qty
    const subtotal = (typeof it.price_subtotal_incl === 'number') 
      ? it.price_subtotal_incl 
      : (typeof it.price_subtotal === 'number') 
        ? it.price_subtotal 
        : (unitPrice * qty);
    
    return {
      id: String(it.id),
      qty,
      discount_amount: Number(it.discount_amount || 0),
      discount_percent: Number(it.discount_percent || it.discount || 0),
      name: it.name || (it.product_id && it.product_id[1]) || 'Product',
      unit: unitPrice,
      subtotal,
      rawItem: it
    };
  }), [cart]);

  const total = useMemo(() => items.reduce((s, it) => s + (it.subtotal || (it.unit * it.qty)), 0), [items]);
  const discountApplied = Number(discountAmount) || 0;
  const finalTotal = Math.max(0, total - discountApplied);

  // Persisted discount presets: load local first, fallback to Odoo fetch
  React.useEffect(() => {
    let mounted = true;
    const loadLocal = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (mounted && Array.isArray(parsed) && parsed.length > 0) {
            setDiscountPresets(parsed);
            return true;
          }
        }
      } catch (e) {
        console.warn('Failed to read local discount presets', e);
      }
      return false;
    };

    const loadDiscounts = async () => {
      try {
        const hasLocal = await loadLocal();
        if (hasLocal) return; // prefer local-managed presets
        const presets = await fetchDiscountsOdoo();
        if (mounted && Array.isArray(presets) && presets.length > 0) {
          setDiscountPresets(presets);
          try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch(e){/* ignore */}
        }
      } catch (e) {
        console.warn('Failed to load discount presets', e);
      }
    };
    loadDiscounts();
    return () => { mounted = false; };
  }, []);

  const refreshDiscounts = async () => {
    try {
      // Only refresh from Odoo when no local presets exist
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        console.log('Local presets present, skipping remote refresh');
        return;
      }
      const presets = await fetchDiscountsOdoo();
      if (Array.isArray(presets)) {
        setDiscountPresets(presets);
        try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch(e){}
      }
    } catch (e) {
      console.warn('refreshDiscounts failed', e);
    }
  };

  const persistPresets = async (presets) => {
    try {
      setDiscountPresets(presets);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets || []));
    } catch (e) {
      console.warn('Failed to persist presets', e);
      setDiscountPresets(presets);
    }
  };

  const handleIncrement = (item) => {
    const newQty = item.qty + 1;
    addProduct({ ...item.rawItem, quantity: newQty, qty: newQty });
  };

  const handleDecrement = (item) => {
    if (item.qty <= 1) {
      removeProduct(item.id);
    } else {
      const newQty = item.qty - 1;
      addProduct({ ...item.rawItem, quantity: newQty, qty: newQty });
    }
  };

  const handleNewOrder = () => {
    clearProducts();
    navigation.navigate('POSProducts');
  };

  const handlePlaceOrder = async () => {
    if (!cart || cart.length === 0) {
      Toast.show({ type: 'error', text1: 'Cart Empty', text2: 'Add products before placing order', position: 'bottom' });
      return;
    }

    setCreatingOrder(true);
    try {
      const lines = cart.map(item => ({
        product_id: item.remoteId || item.id,
        qty: item.quantity || item.qty || 1,
        price_unit: item.price_unit || item.price || 0,
        name: item.name || 'Product',
        discount: Number(item.discount_percent || item.discount || 0),
        price_subtotal: typeof item.price_subtotal !== 'undefined' ? Number(item.price_subtotal) : undefined
      }));

      const sessionId = route?.params?.sessionId;
      const posConfigId = route?.params?.registerId;
      const partnerId = customer?.id || customer?._id || null;

      // Fingerprint of what we're about to submit. If we already created an order
      // and the fingerprint matches, skip the API call and just navigate. Prevents
      // duplicate pos.order rows when the user goes back and taps Place Order again.
      const fingerprintPayload = {
        partnerId: partnerId || null,
        discount: Number(discountApplied) || 0,
        amount_total: Number(finalTotal) || 0,
        lines: lines.map(l => ({
          product_id: l.product_id,
          qty: Number(l.qty) || 0,
          price_unit: Number(l.price_unit) || 0,
          discount: Number(l.discount) || 0,
          price_subtotal: typeof l.price_subtotal === 'undefined' ? null : Number(l.price_subtotal),
        })),
      };
      const fingerprint = JSON.stringify(fingerprintPayload);

      // Path A: same order, same content → no-op API, just navigate.
      if (createdOrderId && submittedFingerprint === fingerprint) {
        console.log('[Place Order] Reusing existing order, no API call:', createdOrderId);
        Toast.show({
          type: 'info',
          text1: 'Continuing Order',
          text2: `Order ID: ${createdOrderId}`,
          position: 'bottom',
        });
        navigation.navigate('POSPayment', {
          orderId: createdOrderId,
          sessionId,
          registerId: posConfigId,
          totalAmount: finalTotal,
          products: cart,
          discountAmount: discountApplied,
          customer,
        });
        return;
      }

      // Path B: order already exists but content changed → write new lines/totals
      // onto the existing pos.order instead of creating a duplicate.
      if (createdOrderId) {
        const lineCommands = [[5, 0, 0]].concat(
          lines.map(l => {
            const price_unit = l.price_unit || 0;
            const qty = l.qty || 1;
            const subtotal = (typeof l.price_subtotal !== 'undefined' && l.price_subtotal !== null)
              ? Number(l.price_subtotal)
              : (price_unit * qty);
            return [0, 0, {
              product_id: l.product_id,
              qty,
              price_unit,
              name: l.name || '',
              discount: Number(l.discount) || 0,
              price_subtotal: subtotal,
              price_subtotal_incl: subtotal,
            }];
          })
        );

        console.log('[Place Order] Updating existing order:', createdOrderId);
        const updResp = await updatePosOrderOdoo(createdOrderId, {
          partner_id: partnerId || false,
          amount_total: Number(finalTotal) || 0,
          lines: lineCommands,
        });
        if (updResp && updResp.error) {
          Toast.show({
            type: 'error',
            text1: 'Order Update Failed',
            text2: updResp.error.message || 'Could not update existing order',
            position: 'bottom',
          });
          return;
        }
        setSubmittedFingerprint(fingerprint);
        Toast.show({
          type: 'success',
          text1: 'Order Updated',
          text2: `Order ID: ${createdOrderId}`,
          position: 'bottom',
        });
        navigation.navigate('POSPayment', {
          orderId: createdOrderId,
          sessionId,
          registerId: posConfigId,
          totalAmount: finalTotal,
          products: cart,
          discountAmount: discountApplied,
          customer,
        });
        return;
      }

      console.log('[Place Order] Creating order with:', { lines, sessionId, posConfigId, partnerId });

      // Don't pass preset_id - let Odoo use default or omit if optional
      const resp = await createPosOrderOdoo({
        partnerId,
        lines,
        sessionId,
        posConfigId,
        discount: discountApplied,
        amount_total: finalTotal
      });

      console.log('[Place Order] Response:', resp);

      if (resp && resp.error) {
        Toast.show({
          type: 'error',
          text1: 'Order Error',
          text2: resp.error.message || JSON.stringify(resp.error) || 'Failed to create order',
          position: 'bottom'
        });
        return;
      }

      const orderId = resp && resp.result ? resp.result : null;
      if (!orderId) {
        Toast.show({ type: 'error', text1: 'Order Error', text2: 'No order ID returned', position: 'bottom' });
        return;
      }

      setCreatedOrderId(orderId);
      setSubmittedFingerprint(fingerprint);

      Toast.show({
        type: 'success',
        text1: 'Order Created',
        text2: `Order ID: ${orderId}`,
        position: 'bottom'
      });

      // Navigate to payment or clear cart
      navigation.navigate('POSPayment', {
        orderId,
        sessionId,
        registerId: posConfigId,
        totalAmount: finalTotal,
        products: cart,
        discountAmount: discountApplied,
        customer
      });
    } catch (error) {
      console.error('[Place Order] Error:', error);
      Toast.show({ 
        type: 'error', 
        text1: 'Order Error', 
        text2: error?.message || 'Failed to create order', 
        position: 'bottom' 
      });
    } finally {
      setCreatingOrder(false);
    }
  };

  const renderLine = ({ item }) => {
    const isSelected = selectedLine && String(selectedLine.id) === String(item.id);
    const imgUrl = item.rawItem?.image_url || item.rawItem?.image_128 || null;
    const initial = (item.name || '?').trim().charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { setSelectedLine(prev => (prev && String(prev.id) === String(item.id) ? null : item)); }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: 12,
          marginBottom: 10,
          backgroundColor: '#fff',
          borderRadius: 14,
          padding: 10,
          borderWidth: 1,
          borderColor: isSelected ? '#2E294E' : '#eef0f5',
          shadowColor: '#1a1a2e',
          shadowOpacity: 0.05,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        {/* Thumbnail (image or letter) */}
        <View style={{
          width: 52, height: 52, borderRadius: 12,
          backgroundColor: '#eef0f5',
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', marginRight: 12,
        }}>
          {imgUrl ? (
            <Image
              source={{ uri: imgUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#2E294E' }}>{initial}</Text>
          )}
        </View>

        {/* Name + price-each + discount chip */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a1a2e' }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ fontSize: 11, color: '#8896ab', fontWeight: '600', marginTop: 2 }}>
            {displayNum(item.unit)} each
          </Text>
          {(item.discount_amount > 0) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <View style={{ backgroundColor: '#ffedd5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, color: '#9a3412', fontWeight: '700' }}>
                  −{displayNum(item.discount_amount)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setProductDiscount(item.rawItem?.id ?? item.id, 0)}
                style={{ marginLeft: 6, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca' }}
              >
                <Text style={{ fontSize: 10, color: '#b91c1c', fontWeight: '700' }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Qty stepper */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: '#f6f7fb', borderRadius: 999,
          marginRight: 10, paddingHorizontal: 2,
        }}>
          <TouchableOpacity onPress={() => handleDecrement(item)} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#2E294E' }}>−</Text>
          </TouchableOpacity>
          <Text style={{ minWidth: 24, textAlign: 'center', fontWeight: '800', color: '#1a1a2e', fontSize: 13 }}>
            {item.qty}
          </Text>
          <TouchableOpacity onPress={() => handleIncrement(item)} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E294E' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Subtotal */}
        <Text style={{ fontWeight: '900', color: '#1a1a2e', fontSize: 14, minWidth: 56, textAlign: 'right' }}>
          {displayNum(item.subtotal || item.price_subtotal || (item.unit * item.qty))}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView backgroundColor={'#f6f7fb'}>
      <NavigationHeader title="Register" onBackPress={() => navigation.goBack()} />
      <View style={{ flex: 1, backgroundColor: '#f6f7fb' }}>
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderLine}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 64 }}>
              <View style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: '#eef0f5',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
              }}>
                <MaterialCommunityIcons name="cart-outline" size={48} color="#8896ab" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#2E294E', marginBottom: 6 }}>Cart is empty</Text>
              <Text style={{ fontSize: 13, color: '#8896ab', textAlign: 'center', paddingHorizontal: 32 }}>
                Tap "Add Products" below to start building this order.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 280 }}
        />

        {/* Bottom action bar */}
        <View style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          shadowColor: '#1a1a2e',
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        }}>
          {/* Total panel */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#2E294E',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 14,
            marginBottom: 12,
          }}>
            <View>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>Total</Text>
              {discountApplied > 0 ? (
                <Text style={{ fontSize: 11, color: '#fbbf24', marginTop: 2 }}>− Discount {displayNum(discountApplied)}</Text>
              ) : (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{items.length} {items.length === 1 ? 'item' : 'items'}</Text>
              )}
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 0.3 }}>{displayNum(finalTotal)}</Text>
          </View>

          {/* Chip row: user / note / customer / line discount / manage */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#eeecf5',
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              marginRight: 8,
              marginBottom: 8,
            }}>
              <MaterialIcons name="person-outline" size={14} color="#6b21a8" style={{ marginRight: 4 }} />
              <Text style={{ fontWeight: '800', color: '#6b21a8', fontSize: 12 }}>{route?.params?.userName || 'Administrator'}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setNoteDraft(noteText); setNoteModalVisible(true); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: noteText ? '#fef3c7' : '#f3f4f6',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                marginRight: 8,
                marginBottom: 8,
                borderWidth: noteText ? 1 : 0,
                borderColor: '#f59e0b',
              }}
            >
              <MaterialIcons
                name="edit-note"
                size={14}
                color={noteText ? '#92400e' : '#374151'}
                style={{ marginRight: 4 }}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontWeight: '800',
                  color: noteText ? '#92400e' : '#374151',
                  fontSize: 12,
                  maxWidth: 140,
                }}
              >
                {noteText ? noteText : 'Note'}
              </Text>
            </TouchableOpacity>
            {selectedLine ? (
              <TouchableOpacity onPress={() => setLineDiscountModalVisible(true)} style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fef3c7',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#f59e0b',
                marginRight: 8,
                marginBottom: 8,
              }}>
                <MaterialIcons name="local-offer" size={14} color="#92400e" style={{ marginRight: 4 }} />
                <Text style={{ fontWeight: '800', color: '#92400e', fontSize: 12 }}>Discount</Text>
              </TouchableOpacity>
            ) : null}
            {/* Customer chip — pushed to the far right, colored to stand out, pencil affordance for edit */}
            <TouchableOpacity
              onPress={openCustomerSelector}
              activeOpacity={0.85}
              style={{
                marginLeft: 'auto',
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: customer ? '#dcfce7' : '#FFEDD5',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                marginBottom: 8,
                borderWidth: 1.5,
                borderColor: customer ? '#22c55e' : '#F47B20',
                shadowColor: customer ? '#22c55e' : '#F47B20',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.18,
                shadowRadius: 4,
                elevation: 2,
                maxWidth: '60%',
              }}
            >
              <MaterialIcons
                name={customer ? 'person-pin' : 'person-add-alt-1'}
                size={15}
                color={customer ? '#166534' : '#9A3412'}
                style={{ marginRight: 5 }}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontWeight: '800',
                  color: customer ? '#166534' : '#9A3412',
                  fontSize: 12,
                  letterSpacing: 0.2,
                  maxWidth: 130,
                }}
              >
                {customer ? customer.name : 'Customer'}
              </Text>
              <View
                style={{
                  marginLeft: 6,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: customer ? '#22c55e' : '#F47B20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialIcons
                  name={customer ? 'edit' : 'add'}
                  size={13}
                  color="#fff"
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Add Products primary CTA (full width) */}
          <TouchableOpacity
            onPress={() => navigation.navigate('POSProducts', { sessionId: route?.params?.sessionId, registerId: route?.params?.registerId })}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F47B20',
              paddingVertical: 14,
              borderRadius: 14,
              marginBottom: 10,
              shadowColor: '#F47B20',
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.32,
              shadowRadius: 10,
              elevation: 8,
            }}
          >
            <MaterialIcons name="add-shopping-cart" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: '900', color: '#fff', fontSize: 15, letterSpacing: 0.4 }}>Add Products</Text>
          </TouchableOpacity>

          {/* Place Order — full width below Add Products */}
          <TouchableOpacity
            onPress={handlePlaceOrder}
            disabled={creatingOrder}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#10b981',
              paddingVertical: 14,
              borderRadius: 14,
              opacity: creatingOrder ? 0.6 : 1,
              shadowColor: '#10b981',
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.32,
              shadowRadius: 10,
              elevation: 7,
            }}
          >
            {creatingOrder ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={{ fontWeight: '900', fontSize: 16, color: '#fff', letterSpacing: 0.3 }}>Place Order</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Discount Modal (simple percentage grid) */}
      <Modal visible={discountModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDiscountModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width: '80%', backgroundColor:'#fff', borderRadius:12, padding:20, alignItems:'center' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:10 }}>Select Discount</Text>
            <Text style={{ color:'#666', marginBottom:14 }}>Tap a percentage to apply</Text>

            <View style={{ width:'100%', minHeight:120, justifyContent:'center', alignItems:'center' }}>
              {discountPresets && discountPresets.length > 0 ? (
                <View style={{ width:'100%', flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                  {discountPresets.slice(0,6).map(p => ({ id: p.id, label: p.is_percentage ? `${p.amount}%` : `${Number(p.amount)}`, value: p })).map(btn => (
                    <Pressable key={btn.id} onPress={() => {
                      const p = btn.value;
                      const amt = p.is_percentage ? Number(total * (p.amount || 0) / 100) : Number(p.amount || 0);
                      setDiscountAmount(amt);
                      setDiscountModalVisible(false);
                    }} style={{ width:'30%', aspectRatio:1, marginBottom:12, borderRadius:10, backgroundColor:'#f3f4f6', justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#e6e6e6' }}>
                      <Text style={{ fontWeight:'800', fontSize:16 }}>{btn.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems:'center' }}>
                  <Text style={{ color:'#666', marginBottom:12 }}>No discounts defined. Add discounts from Manage.</Text>
                  <TouchableOpacity onPress={() => { setManageModalVisible(true); setDiscountModalVisible(false); }} style={{ paddingVertical:10, paddingHorizontal:16, backgroundColor:'#06b6d4', borderRadius:8 }}>
                    <Text style={{ color:'#fff', fontWeight:'700' }}>Open Manage</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <TouchableOpacity onPress={() => setDiscountModalVisible(false)} style={{ marginTop:8, width:'100%', paddingVertical:12, borderRadius:8, backgroundColor:'#f3f4f6', alignItems:'center' }}>
              <Text style={{ color:'#6b7280', fontWeight:'700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Per-line Discount Modal */}
      <Modal visible={lineDiscountModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setLineDiscountModalVisible(false); setSelectedLine(null); setLineDiscountInput(''); }}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width: '85%', backgroundColor:'#fff', borderRadius:12, padding:20, alignItems:'center' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:10 }}>Apply Discount</Text>
            <Text style={{ fontSize:16, fontWeight:'700', marginBottom:4 }}>{selectedLine ? selectedLine.name : ''}</Text>
            <Text style={{ fontSize:14, color:'#666', marginBottom:16 }}>
              Price: {displayNum((selectedLine?.unit || 0) * (selectedLine?.qty || 1))}
            </Text>

            <Text style={{ color:'#333', marginBottom:8, fontWeight:'600' }}>Enter discount amount</Text>
            <View style={{ flexDirection:'row', alignItems:'center', borderWidth:2, borderColor:'#f59e0b', borderRadius:10, paddingHorizontal:12, paddingVertical:8, marginBottom:16, width:'100%' }}>
              <TextInput
                placeholder="0.00"
                value={lineDiscountInput}
                onChangeText={(t) => setLineDiscountInput(t.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                style={{ flex:1, fontSize:24, textAlign:'center', padding:8, fontWeight:'700' }}
              />
              <Text style={{ fontSize:18, fontWeight:'800', color:'#666', marginLeft:8 }}>OMR</Text>
            </View>

            <View style={{ flexDirection:'row', width:'100%', justifyContent:'space-between' }}>
              <TouchableOpacity
                onPress={() => {
                  if (selectedLine) {
                    setProductDiscount(selectedLine.rawItem?.id ?? selectedLine.id, 0);
                  }
                  setLineDiscountModalVisible(false);
                  setSelectedLine(null);
                  setLineDiscountInput('');
                }}
                style={{ flex:1, paddingVertical:12, borderRadius:8, backgroundColor:'#fee2e2', marginRight:8, alignItems:'center' }}>
                <Text style={{ color:'#dc2626', fontWeight:'700' }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setLineDiscountModalVisible(false);
                  setSelectedLine(null);
                  setLineDiscountInput('');
                }}
                style={{ flex:1, paddingVertical:12, borderRadius:8, backgroundColor:'#f3f4f6', marginRight:8, alignItems:'center' }}>
                <Text style={{ color:'#6b7280', fontWeight:'700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!selectedLine) return;
                  const discountAmt = parseFloat(lineDiscountInput) || 0;
                  // Pass fixed discount amount directly (stays same when qty changes)
                  setProductDiscount(selectedLine.rawItem?.id ?? selectedLine.id, discountAmt);
                  setLineDiscountModalVisible(false);
                  setSelectedLine(null);
                  setLineDiscountInput('');
                }}
                style={{ flex:1, paddingVertical:12, borderRadius:8, backgroundColor:'#f59e0b', alignItems:'center' }}>
                <Text style={{ color:'#fff', fontWeight:'700' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Manage Discounts Modal (triggered from footer Manage button) */}

      <Modal visible={manageModalVisible} animationType="slide" transparent={true} onRequestClose={() => setManageModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16 }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Manage Discounts</Text>
            <TouchableOpacity onPress={() => { setAddModalVisible(true); setManageModalVisible(false); }} style={{ padding:12, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:10 }}>
              <Text style={{ fontWeight:'700' }}>➕ Add Discount</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditModalVisible(true); setManageModalVisible(false); }} style={{ padding:12, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:10 }}>
              <Text style={{ fontWeight:'700' }}>✏️ Edit Discount</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setDeleteModalVisible(true); setManageModalVisible(false); }} style={{ padding:12, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:10 }}>
              <Text style={{ fontWeight:'700' }}>🗑️ Delete Discount</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setManageModalVisible(false)} style={{ padding:12, marginTop:8 }}>
              <Text style={{ color:'#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Discount Modal (simple percentage only) */}
      <Modal visible={addModalVisible} animationType="slide" transparent={true} onRequestClose={() => setAddModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16 }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Add New Discount</Text>
            <Text style={{ fontSize:13, color:'#666', marginBottom:10 }}>Enter discount percentage</Text>
            <View style={{ flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, paddingHorizontal:8, paddingVertical:6, marginBottom:12 }}>
              <TextInput placeholder="15" value={addAmount} onChangeText={(t) => setAddAmount(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" style={{ flex:1, fontSize:22, textAlign:'center', padding:8 }} />
              <Text style={{ fontSize:20, fontWeight:'800', color:'#10b981', marginLeft:8 }}>%</Text>
            </View>
            <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
              <TouchableOpacity onPress={() => { setAddModalVisible(false); setAddAmount(''); }} style={{ padding:12 }}>
                <Text style={{ color:'#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                const amt = parseFloat(addAmount) || 0;
                const name = `${amt}%`;
                const newPreset = { id: `local_${Date.now()}`, name, amount: amt, is_percentage: true };
                const updated = Array.isArray(discountPresets) ? [...discountPresets, newPreset] : [newPreset];
                await persistPresets(updated);
                Toast.show({ type:'success', text1:'Created', text2:`${name} discount added` });
                setAddModalVisible(false);
                setAddAmount('');
              }} style={{ backgroundColor:'#10b981', paddingVertical:12, paddingHorizontal:16, borderRadius:8 }}>
                <Text style={{ color:'#fff', fontWeight:'800' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Discount Modal (list then edit) */}
      <Modal visible={editModalVisible} animationType="slide" transparent={true} onRequestClose={() => setEditModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16, maxHeight:'80%' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Edit Discount</Text>
            <FlatList data={discountPresets} keyExtractor={d => String(d.id)} renderItem={({item}) => (
              <TouchableOpacity onPress={() => setEditingPreset(item)} style={{ padding:12, borderBottomWidth:1, borderColor:'#f3f4f6' }}>
                <Text style={{ fontWeight:'700' }}>{item.name} {item.is_percentage ? `(${item.amount}%)` : `(${Number(item.amount)})`}</Text>
              </TouchableOpacity>
            )} />
            {editingPreset ? (
              <View style={{ marginTop:12 }}>
                <Text style={{ marginBottom:8, color:'#444' }}>Edit percentage for <Text style={{ fontWeight:'800' }}>{editingPreset.name}</Text></Text>
                <View style={{ flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, paddingHorizontal:8, paddingVertical:6, marginBottom:12 }}>
                  <TextInput placeholder="15" value={String(editingPreset.amount)} onChangeText={(t) => setEditingPreset(prev => ({...prev, amount: Number(t.replace(/[^0-9.]/g, '')) || 0}))} keyboardType="numeric" style={{ flex:1, fontSize:20, textAlign:'center', padding:8 }} />
                  <Text style={{ fontSize:20, fontWeight:'800', color:'#10b981', marginLeft:8 }}>%</Text>
                </View>
                <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
                  <TouchableOpacity onPress={() => { setEditingPreset(null); }} style={{ padding:12 }}>
                    <Text style={{ color:'#6b7280' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={async () => {
                    const vals = { name: `${editingPreset.amount}%`, amount: editingPreset.amount, is_percentage: true };
                    const updated = (Array.isArray(discountPresets) ? discountPresets.map(d => d.id === editingPreset.id ? { ...d, ...vals } : d) : [{ ...editingPreset, ...vals }]);
                    await persistPresets(updated);
                    Toast.show({ type:'success', text1:'Updated' });
                    setEditingPreset(null);
                    setEditModalVisible(false);
                  }} style={{ backgroundColor:'#2563eb', paddingVertical:12, paddingHorizontal:16, borderRadius:8 }}>
                    <Text style={{ color:'#fff', fontWeight:'800' }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Delete Discount Modal */}
      <Modal visible={deleteModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16, maxHeight:'80%' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Delete Discount</Text>
                <FlatList data={discountPresets} keyExtractor={d => String(d.id)} renderItem={({item}) => (
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderColor:'#f3f4f6' }}>
                <Text>{item.name} {item.is_percentage ? `(${item.amount}%)` : `(${Number(item.amount)})`}</Text>
                <TouchableOpacity onPress={async () => {
                  const updated = (Array.isArray(discountPresets) ? discountPresets.filter(d => d.id !== item.id) : []);
                  await persistPresets(updated);
                  Toast.show({ type:'success', text1:'Deleted' });
                }} style={{ padding:8, backgroundColor:'#f97316', borderRadius:6 }}>
                  <Text style={{ color:'#fff' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            )} />
            <TouchableOpacity onPress={() => setDeleteModalVisible(false)} style={{ padding:12, marginTop:8 }}>
              <Text style={{ color:'#6b7280' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Order Note Modal */}
      <Modal
        visible={noteModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{
            width: '100%', maxWidth: 480,
            backgroundColor: '#fff', borderRadius: 16, padding: 18,
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialIcons name="edit-note" size={22} color="#2E294E" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1a1a2e', marginLeft: 8 }}>Order Note</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => setNoteModalVisible(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}
              >
                <MaterialIcons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="e.g. No onions, deliver after 6pm…"
              placeholderTextColor="#9ca3af"
              multiline
              style={{
                minHeight: 110, textAlignVertical: 'top',
                borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
                padding: 12, fontSize: 14, color: '#111827',
                backgroundColor: '#f9fafb', marginBottom: 14,
              }}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {noteText ? (
                <TouchableOpacity
                  onPress={() => { setNoteText(''); setNoteDraft(''); setNoteModalVisible(false); }}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center' }}
                >
                  <Text style={{ color: '#b91c1c', fontWeight: '800', fontSize: 13 }}>Clear</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => setNoteModalVisible(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' }}
              >
                <Text style={{ color: '#6b7280', fontWeight: '800', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setNoteText(noteDraft.trim()); setNoteModalVisible(false); }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2E294E', alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default TakeoutDelivery;
