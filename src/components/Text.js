import { FONT_FAMILY } from '@constants/theme';
import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';

const Text = ({ style, fontFamily, children }) => {
  return <RNText style={[styles.defaultText, { fontFamily }, style]}>{children}</RNText>;
};

const styles = StyleSheet.create({
  defaultText: {
   fontFamily: FONT_FAMILY.urbanistMedium
  },
});

export default Text;
