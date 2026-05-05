import React from 'react';
import { View } from 'react-native';
import styles from './styles';

const EmptyItem = () => {
  return <View style={[styles.itemStyle, styles.itemInvisible]} />;
};

export default EmptyItem;
