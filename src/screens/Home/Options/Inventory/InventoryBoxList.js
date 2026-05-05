import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';

const InventoryBoxList = ({ item }) => {
  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.title}>{item?.product_name || '-'}</Text>
        <View style={{ justifyContent: 'space-between', flexDirection: 'row', flex: 1 }}>
          <Text style={styles.content}>{'Quantity'}</Text>
          <Text style={styles.contentRight}>{item?.quantity || '-'}</Text>
        </View>
        <View style={{ justifyContent: 'space-between', flexDirection: 'row', flex: 1 }}>
          <Text style={styles.content}>{'UOM'}</Text>
          <Text style={styles.contentRight}>{item?.uom_name || '-'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    // marginHorizontal: 10,
    marginVertical: 5,
    backgroundColor:COLORS.boxTheme,
    borderRadius: 8,
    borderWidth:2,
    borderColor:'white',
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
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16,
    marginBottom: 5,
    color: COLORS.listText
  },
  content: {
    color: COLORS.listText,
    marginBottom: 5,
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    textTransform: 'capitalize'
  },
  contentRight: {
    color: COLORS.listText,
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 15,
  },
});

export default InventoryBoxList;
