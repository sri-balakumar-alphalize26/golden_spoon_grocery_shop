// components/containers/RoundedContainer.js

import React from 'react';
import { View } from 'react-native';
import { COLORS } from '@constants/theme';

const RoundedContainer = ({ children, backgroundColor=COLORS.white, ...props }) => {
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor, borderTopLeftRadius: 20, borderTopRightRadius: 20, ...props }}>
      {children}
    </View>
  );
};

export default RoundedContainer;
