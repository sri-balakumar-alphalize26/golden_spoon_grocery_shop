import React from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS } from '@constants/theme';

const RoundedScrollContainer = ({ children, backgroundColor = COLORS.white, borderRadius = true, scrollEnabled = true, ...props }) => {

  const containerStyles = {
    flex: 1,
    paddingHorizontal: 6,
    backgroundColor: backgroundColor,
    ...(borderRadius && { borderTopLeftRadius: 15, borderTopRightRadius: 15 }),
    ...props,
  };

  return (
    // <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={containerStyles}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: borderRadius ? 15 : 0 }} showsVerticalScrollIndicator={false} scrollEnabled={scrollEnabled}>
          {children}
        </ScrollView>
      </View>
    // </KeyboardAvoidingView>
  );
};

export default RoundedScrollContainer;