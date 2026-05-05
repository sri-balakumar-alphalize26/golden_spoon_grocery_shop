// CheckBox.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Checkbox } from 'react-native-paper';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const CheckBox = ({ label, checked, onPress = () => { } }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Checkbox
        status={checked ? 'checked' : 'unchecked'}
        onPress={() => onPress(!checked)}
        color={COLORS.primaryThemeColor}
      />
    </View>
  );
};

export default CheckBox;


const styles = StyleSheet.create({
  container: {
    marginBottom: 5,
    flexDirection: 'row',
    // justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    // flex: 2/5,
    marginVertical: 8,
    fontSize: 16,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },

});
