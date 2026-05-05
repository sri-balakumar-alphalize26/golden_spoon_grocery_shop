import React, { useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, TextInput } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { AntDesign } from '@expo/vector-icons';

const EditPurchaseOrderList = ({ item, onPress, onDeletePress }) => {
  const {
    product = { product_name: '-' },
    description = '-',
    scheduled_date = '-',
    quantity = '-',
    recieved_quantity = '-',
    product_unit_of_measure = '-',
    sub_total = '-',
    unit_price = '-',
    taxes = { taxes_name: '-' },
    product_name = '-',
    tax_type_name = '',
  } = item || {};

  const pendingQuantity = quantity - recieved_quantity;
  return (
    <View style={styles.itemContainer}>
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemsContainer}>
        <View style={styles.leftColumn}>
          <Text style={styles.head}>{product.product_name?.trim()} || {product_name?.trim() || '-'}</Text>
          <View style={styles.rightColumn}>
            <Text style={styles.content}>Scheduled Date: {scheduled_date}</Text>
          </View>
          <View style={styles.rightColumn}>
            <Text style={styles.content}>Sub Total: {sub_total}</Text>
            <Text style={styles.content}>Quantity: {quantity}</Text>
          </View>
          <View style={styles.rightColumn}>
            <Text style={styles.content}>Description: {description || '-'}</Text>
            <Text style={styles.content}>Received Quantity: {recieved_quantity}</Text>
          </View>
          <View style={styles.rightColumn}>
            <Text style={styles.content}>Pending Quantity: {pendingQuantity}</Text>
            <Text style={styles.contentRight}>UOM: {product_unit_of_measure}</Text>
          </View>
          <View style={styles.rightColumn}>
            <Text style={styles.content}>Unit Price: {unit_price}</Text>
            <Text style={styles.content}>Taxes: {taxes.taxes_name} || {tax_type_name}</Text>
          </View>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDeletePress} style={styles.deleteIcon}>
        <AntDesign name="delete" size={20} />
      </TouchableOpacity>
    </View>
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
  itemsContainer: {
    flex: 1,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    flex: 1,
  },
  quantityLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 5,
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
  quantityInput: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryThemeColor,
    padding: 5,
    marginBottom: 10,
  },
  deleteIcon: {
    padding: 1,
    left: 140,
    color: COLORS.primaryThemeColor
  }
});

export default EditPurchaseOrderList;
