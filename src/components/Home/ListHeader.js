import React from 'react';
import { View, StyleSheet } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const ListHeader = ({ title }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{title}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderColor: 'black',
    borderRadius: 5,
    backgroundColor: COLORS.white,
  },
  text: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.urbanistExtraBold,
    color: 'black',
  },
});

export default ListHeader;
