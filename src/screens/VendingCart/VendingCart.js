import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { SafeAreaView, RoundedContainer, ButtonContainer } from '@components/containers';
import Text from '@components/Text';
import { Button } from '@components/common/Button';
import { useProductStore } from '@stores/product';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const VendingCart = ({ navigation, route }) => {
  const product = route?.params?.product || {};
  const [quantity, setQuantity] = useState(1);

  const increment = () => setQuantity((q) => q + 1);
  const decrement = () => setQuantity((q) => Math.max(1, q - 1));

  const { addProduct, setCurrentCustomer } = useProductStore();

  const mapToStoreProduct = (p) => ({
    id: `product_${p.id}`,
    remoteId: p.id,
    name: p.name || 'Product',
    product_name: p.name || 'Product',
    price: Number(p.list_price ?? 0),
    price_unit: Number(p.list_price ?? 0),
    quantity: Number(p.qty_available ?? 1),
    qty: Number(p.qty_available ?? 1),
    image_url: p.image_url || null,
    product_id: p.id,
    product_code: p.default_code || null,
    categ_id: Array.isArray(p.categ_id) ? p.categ_id[0] : p.categ_id || null,
  });

  const handleAddToCart = () => {
    try {
      // Ensure a guest customer id is set for POS flows
      try { setCurrentCustomer('pos_guest'); } catch (e) { /* ignore */ }
      const storeItem = mapToStoreProduct(product);
      console.log('[VendingCart] Adding to cart', storeItem);
      addProduct(storeItem);
      navigation.navigate('CartScreen');
    } catch (e) {
      console.error('VendingCart add to cart error', e);
    }
  };

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <RoundedContainer>
        <View style={styles.container}>
          <Image source={{ uri: product.image_url || product.product_image || undefined }} style={styles.image} />
          <Text style={styles.name}>{product.product_name || product.name || 'Product'}</Text>
          <Text style={styles.price}>Price: {product.price ?? product.list_price ?? 0}</Text>

          <View style={styles.qtyRow}>
            <Button title="-" onPress={decrement} style={styles.qtyBtn} />
            <Text style={styles.qtyText}>{quantity}</Text>
            <Button title="+" onPress={increment} style={styles.qtyBtn} />
          </View>

          <ButtonContainer>
            <Button title="Add to Cart" onPress={handleAddToCart} paddingHorizontal={40} />
          </ButtonContainer>
        </View>
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 20 },
  image: { width: 140, height: 140, resizeMode: 'contain', marginBottom: 12 },
  name: { fontSize: 20, fontFamily: FONT_FAMILY.urbanistBold, color: '#111', marginBottom: 6 },
  price: { fontSize: 16, color: '#333', marginBottom: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  qtyBtn: { width: 56, height: 40, borderRadius: 8 },
  qtyText: { marginHorizontal: 12, fontSize: 18 },
});

export default VendingCart;
