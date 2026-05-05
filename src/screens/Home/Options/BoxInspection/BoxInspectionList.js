import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Dimensions, Image } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';

const { width } = Dimensions.get('window');

const BoxInspectionList = ({ item, onPress }) => {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <Image source={require('@assets/icons/common/box.png')} style={{width: 30, height: 30, resizeMode: 'contain'}}/>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{item?.boxName || '-'}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    flex: 1,
    marginHorizontal: 8,
    marginVertical: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    // width: '100%',
    width: width * 0.22, // Adjusts the width based on screen size
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 6,
      },
      ios: {
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
    }),
  },
  leftColumn: {
    flex: 1,
    alignItems: 'center',
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16, // Adjusted for better readability across devices
  },
});

export default BoxInspectionList;
