import React, { useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';

const PurchaseOrderDetailList = ({ item, onPress }) => {

  const {
    product = { product_name: '-'},
    description = '-',  
    scheduled_date = '-',
    quantity = '-',
    recieved_quantity = 0,
    product_unit_of_measure = '-',
    unit_price = '-',
    taxes = { taxes_name: '-' },
    sub_total = '-'
  } = item || {};

  const pendingQuantity = quantity - recieved_quantity;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{product.product_name.trim()}</Text>
        <View style={styles.rightColumn}> 
          <Text style={styles.content}>{scheduled_date}</Text>
          <Text style={styles.contentRight}>{quantity}</Text>
          <Text style={styles.content}>Sub : {sub_total || '-'}</Text>
        </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>Des : {description || '-'}</Text>
        <Text style={styles.content}>RQ : {recieved_quantity || '0'}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>PQ : {pendingQuantity || '-'}</Text>
        <Text style={styles.contentRight}>UOM : {product_unit_of_measure || '-'}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>UP : {unit_price}</Text>
        <Text style={styles.content}>TX : {taxes.taxes_name || '-'}</Text>
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
});

export default PurchaseOrderDetailList;