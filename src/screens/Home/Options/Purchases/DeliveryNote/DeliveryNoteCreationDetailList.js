import React, { useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, TextInput } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';

const DeliveryNoteCreationDetailList = ({ item, onPress, onQuantityChange }) => {
  // Destructure the fields for easier access
  const {
    product = { product_name: '-' },
    description = '-',
    scheduled_date = '-',
    quantity = '-',
    product_unit_of_measure = '-',
    unit_price = '-',
    taxes = { taxes_name: '-' },
  } = item || {};

  const [editableQuantity, setEditableQuantity] = useState(quantity.toString());

  const handleQuantityChange = (text) => {
    setEditableQuantity(text);
    if (onQuantityChange) {
      onQuantityChange(text);
    }
  };

  const sub_total = parseFloat(unit_price || 0) * parseFloat(editableQuantity || 0);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{product.product_name.trim()}</Text>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{description || '-'}</Text>
          <View style={styles.quantityContainer}>
            <Text style={styles.quantityLabel}>Edit Quantity</Text>
            <TextInput
              style={[styles.contentRight, styles.quantityInput]}
              value={editableQuantity}
              onChangeText={handleQuantityChange}
              keyboardType="numeric"
            />
          </View>
        </View>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{scheduled_date}</Text>
          <Text style={styles.contentRight}>{product_unit_of_measure}</Text>
        </View>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{taxes.taxes_name}</Text>
          <Text style={styles.content}>{parseFloat(unit_price || 0).toFixed(2)}</Text>
          <Text style={styles.content}>{sub_total.toFixed(2)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
      },
    }),
    padding: 20,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    flex: 1,
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 17,
    marginBottom: 5,
  },
  content: {
    color: '#666666',
    marginBottom: 5,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'capitalize',
  },
  contentRight: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 14,
  },
  quantityLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 5,
  },
  quantityInput: {
    justifyContent: 'space-between',
    padding: 2,
    margin: 2,
    textAlign: 'right',
    backgroundColor: 'beige',
    borderWidth: 1,
    width: "100%",
  },
});

export default DeliveryNoteCreationDetailList;