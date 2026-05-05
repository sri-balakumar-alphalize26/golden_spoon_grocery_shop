import React, { useState } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';

const VendorBillDetailList = ({ item, onPress }) => {

  const {
    product = { product_name: '-', product_description: '-' },
    scheduled_date = '-',
    quantity = '-',
    recieved_quantity = '-',
    billed_quantity = '-',
    product_unit_of_measure = '-',
    unit_price = '-',
    taxes = { taxes_name: '-' },
    sub_total = '-'
  } = item || {};

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{product.product_name.trim()}</Text>
        <View style={styles.rightColumn}> 
          <Text style={styles.content}>{scheduled_date}</Text>
          <Text style={styles.contentRight}>{quantity}</Text>
          <Text style={styles.content}>Tot : {sub_total || '-'}</Text>
        </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>Des : {product.product_description || 'Nill'}</Text>
        <Text style={styles.content}>RQ : {recieved_quantity || '0'}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>BQ : {billed_quantity || '0'}</Text>
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

export default VendorBillDetailList;

// import React from 'react';
// import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
// import Text from '@components/Text';
// import { FONT_FAMILY } from '@constants/theme';

// const VendorBillDetailList = ({ item, untaxed_total_amount, onPress }) => {
//   const formatValue = (value) => (value !== null && value !== undefined ? value : '-');

//   const {
//     product = { product_name: '-', product_description: '-' },
//     quantity = '-',
//     recieved_quantity = item?.recieved_quantity ?? '-',
//     billed_quantity = item?.billed_quantity ?? '-',
//     product_unit_of_measure = item?.product_unit_of_measure ?? '-',
//     unit_price = item?.unit_price ?? '-',
//     taxes = item?.taxes ?? { taxes_name: '-' },
//   } = item || {};

//   const pendingQuantity = quantity - recieved_quantity;

//   return (
//     <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
//       <View style={styles.leftColumn}>
//         <Text style={styles.head}>{product.product_name.trim()}</Text>
//         <View style={styles.rightColumn}>
//           <Text style={styles.content}>Des : {product.product_description || '-'}</Text>
//           <Text style={styles.contentRight}>Quan : {formatValue(quantity)}</Text>
//         </View>
//         <View style={styles.rightColumn}>
//           <Text style={styles.content}>RQ : {formatValue(recieved_quantity)}</Text>
//           <Text style={styles.content}>BQ : {formatValue(billed_quantity)}</Text>
//         </View>
//         <View style={styles.rightColumn}>
//           <Text style={styles.contentRight}>UOM : {formatValue(product_unit_of_measure)}</Text>
//           <Text style={styles.content}>Unit Price : {formatValue(unit_price)}</Text>
//         </View>
//         <View style={styles.rightColumn}>
//           <Text style={styles.content}>Tax : {taxes?.taxes_name ?? '-'}</Text>
//           <Text style={styles.content}>Tot : {untaxed_total_amount}</Text>
//         </View>
//       </View>
//     </TouchableOpacity>
//   );
// };

// const styles = StyleSheet.create({
//   itemContainer: {
//     marginHorizontal: 5,
//     marginVertical: 5,
//     backgroundColor: 'white',
//     borderRadius: 15,
//     ...Platform.select({
//       android: {
//         elevation: 4,
//       },
//       ios: {
//         shadowColor: 'black',
//         shadowOffset: { width: 0, height: 2 },
//         shadowOpacity: 0.2,
//       },
//     }),
//     padding: 20,
//   },
//   leftColumn: {
//     flex: 1,
//   },
//   rightColumn: {
//     justifyContent: 'space-between',
//     flexDirection: 'row',
//     flex: 1,
//   },
//   head: {
//     fontFamily: FONT_FAMILY.urbanistBold,
//     fontSize: 17,
//     marginBottom: 5,
//   },
//   content: {
//     color: '#666666',
//     marginBottom: 5,
//     fontSize: 14,
//     fontFamily: FONT_FAMILY.urbanistSemiBold,
//     textTransform: 'capitalize',
//   },
//   contentRight: {
//     color: '#666666',
//     fontFamily: FONT_FAMILY.urbanistSemiBold,
//     fontSize: 14,
//   },
// });

// export default VendorBillDetailList;
