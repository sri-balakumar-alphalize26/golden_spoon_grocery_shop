import React, { useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';

const DeliveryNoteDetailList = ({ item, onPress }) => {
  const currency = useAuthStore((s) => s.currency);

  // Destructure the fields for easier access
  const {
    product = { product_name: '-'},
    description = '-',
    scheduled_date = '-',
    quantity = '-',
    product_unit_of_measure = '-',
    unit_price = '-',
    taxes = { taxes_name: '-' },
    sub_total = unit_price * quantity,
    // total_amount = '-',
  } = item || {};

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{product.product_name.trim()}</Text>
        <View style={styles.rightColumn}> 
          <Text style={styles.content}>{description || '-'}</Text>
          <Text style={styles.contentRight}>{quantity}</Text>
        </View>
      <View style={styles.rightColumn}>
          <Text style={styles.content}>{scheduled_date}</Text>
          <Text style={styles.contentRight}>{product_unit_of_measure}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>{taxes.taxes_name}</Text>
        <Text style={styles.content}>{formatCurrency(Number(unit_price) || 0, currency)}</Text>
        <Text style={styles.content}>{formatCurrency(Number(sub_total) || 0, currency)}</Text>
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

export default DeliveryNoteDetailList;