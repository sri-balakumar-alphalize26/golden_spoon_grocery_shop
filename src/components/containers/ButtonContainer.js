import React from 'react';
import { View } from 'react-native';

const ButtonContainer = ({ children, ...props }) => {
  return (
    <View style={{ marginHorizontal: '25%', marginVertical: 20, ...props }}>
      {children}
    </View>
  );
};

export default ButtonContainer;
