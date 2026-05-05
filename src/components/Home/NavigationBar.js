import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';

const NavigationBar = ({ onSearchPress, onOptionsPress, onScannerPress }) => {
  return (
    <TouchableOpacity  activeOpacity={0.8} style={styles.container} onPress={onOptionsPress}>
      <TouchableOpacity onPress={onSearchPress}>
        <Image source={require('@assets/images/Home/Header/search.png')} style={styles.icon} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onScannerPress}>
        <Image source={require('@assets/images/Home/Header/barcode_scanner.png')} style={styles.icon} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2e294e',
    padding: 10,
    marginHorizontal: 20,
    borderRadius: 10,
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  icon: {
    width: 20,
    height: 20,
    tintColor: 'white',
  },
});

export default NavigationBar;
