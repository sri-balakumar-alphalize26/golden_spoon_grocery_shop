import React from 'react';
import { View } from 'react-native';
import { SafeAreaView as RNSSafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@constants/theme';
import { StatusBar } from 'expo-status-bar';

const SafeAreaView = ({ children, backgroundColor = COLORS.primaryThemeColor }) => {

  return (
    <RNSSafeAreaView style={{ flex: 1, backgroundColor: backgroundColor }}>
      <StatusBar backgroundColor={backgroundColor}  style='auto' />
      {children}
    </RNSSafeAreaView>
  );
};

export default SafeAreaView;
