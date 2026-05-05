import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const Header = () => {
  return (
    <View style={styles.container}>
      <Image 
        source={require('@assets/images/Home/Header/header_transparent_bg.png')} 
        style={styles.backgroundImage} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backgroundImage: {
    width: width * 0.5,
    aspectRatio: 2.2,
    resizeMode: 'contain',
    opacity: 0.92,
    marginTop: -18,
  },
  // notificationIcon removed
});

export default Header;
