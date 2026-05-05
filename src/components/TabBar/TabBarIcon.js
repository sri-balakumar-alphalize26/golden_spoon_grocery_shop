// components/TabBarIcon.js
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY, ICON_SIZE, BORDER_RADIUS } from '@constants/theme';

const TabBarIcon = ({ iconComponent, label, focused }) => (
  <View style={styles.container}>
    <View style={[styles.iconContainer, { backgroundColor: focused ? COLORS.white : COLORS.primaryThemeColor }]}>
      <Image source={iconComponent} style={styles.icon} tintColor={focused ? COLORS.lightBlack : COLORS.white} />
    </View>
    <Text style={styles.label} numberOfLines={1}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 30,
    borderRadius: BORDER_RADIUS.iconRadius,
  },
  icon: {
    width: ICON_SIZE.small,
    height: ICON_SIZE.small,
  },
  label: {
    color: COLORS.white,
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    marginTop: 2,
  },
});

export default TabBarIcon;
