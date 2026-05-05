import React from 'react';
import { TabBar } from 'react-native-tab-view';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const CustomTabBar = ({ scrollEnabled = true, ...props }) => (
  <TabBar
    {...props}
    scrollEnabled={scrollEnabled}
    style={{
      backgroundColor: COLORS.tabColor,
      justifyContent: 'center',
    }}
    indicatorStyle={{ backgroundColor: COLORS.tabIndicator, height: 3 }}
    labelStyle={{ color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, textTransform: 'capitalize' }}
    pressColor='#2e294e'
    pressOpacity={0.5}
  />
);

export default CustomTabBar;
