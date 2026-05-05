import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';

const SparePartsCreationList = ({ item, onPress }) => {
  return (
    // <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.itemContainer}>
    <TouchableOpacity onPress={() => handleSelectItem(item)} activeOpacity={0.8} style={styles.itemContainer}>
    <View style={styles.leftColumn}>
        <Text style={styles.head}>{item?.name?.trim() || '-'}</Text>
        <Text style={styles.contentRight}>{item?.quantity}</Text>
        <Text style={styles.content}>{item?.uom || '-'}</Text>
    </View>
    <View style={styles.rightColumn}>
        <Checkbox
            status={isSelected ? 'checked' : 'unchecked'}
            onPress={() => handleSelectItem(item)}
            color={COLORS.primaryThemeColor}
            style={styles.checkbox}
        />
    </View>
</TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
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
  head: {
      fontFamily: FONT_FAMILY.urbanistBold,
      fontSize: 17,
      marginBottom: 5,
      flexDirection: "row",
  },
  contentRight: {
      color: '#666666',
      fontFamily: FONT_FAMILY.urbanistSemiBold,
      fontSize: 15,
  },
  content: {
      color: '#666666',
      marginBottom: 5,
      fontSize: 15,
      fontFamily: FONT_FAMILY.urbanistSemiBold,
      textTransform: 'capitalize',
  },
  rightColumn: {
      flexDirection: 'row',  
      alignItems: 'center',  
      justifyContent: 'flex-end',
      flex: 1,
  },
  checkbox: {
      marginLeft: 15,
      alignSelf: 'center',
      position: "fixed",
  },
});

export default SparePartsCreationList;