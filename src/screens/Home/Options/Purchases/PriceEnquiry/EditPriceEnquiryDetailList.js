import React, { useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Switch } from 'react-native-paper';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';
import { TextInput as FormInput } from "@components/common/TextInput";

const EditPriceEnquiryDetailList = ({ item, onPriceChange, onUpdateStatus }) => {
  const [isSwitchOn, setIsSwitchOn] = useState(false);

  // Destructure item properties for easy access
  const {
    products: { product_name = '-' } = {},
    quantity = '-',
    status = '-',
    supplier = null,
    price = '',
  } = item || {};

  const suppliers = supplier ? [supplier] : [];
  const isSwitchEnabled = status === 'Pending' || 'Approved' && price !== '-';

  const handlePriceChange = (value) => {
    onPriceChange?.(item._id, value); // Notify parent of the price change
  };

  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{product_name.trim()}</Text>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{quantity}</Text>
          <Text style={[styles.contentRight, { color: 'red' }]}>{status}</Text>
        </View>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>{price}</Text>
        <View style={styles.contentRight}>
          {suppliers.length > 0 ? (
            suppliers.map((supplierItem, index) => (
              <Text key={index} style={styles.supplierContent}>
                {supplierItem.suplier_name || '-'}
                {index < suppliers.length - 1 ? ', ' : ''}
              </Text>
            ))
          ) : (
            <Text style={styles.supplierContent}>No suppliers</Text>
          )}
        </View>
        <FormInput
          label={"Add Price"}
          editable={true}
          keyboardType="numeric"
          value={price.toString()}
          onChangeText={handlePriceChange}
        />
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
    flex: 1
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
    textTransform: 'capitalize'
  },
  contentRight: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 14,
  },
  switchContainer: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
});

export default EditPriceEnquiryDetailList;
