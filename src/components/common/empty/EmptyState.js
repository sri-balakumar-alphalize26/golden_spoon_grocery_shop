import { COLORS, FONT_FAMILY } from '@constants/theme';
import React from 'react';
import { View, Image, Text, StyleSheet, Dimensions } from 'react-native';

const EmptyState = ({ imageSource, message }) => (
  <View style={styles.container}>
    <Image source={imageSource} style={styles.image} />
    {/* Message removed intentionally */}
  </View>
);

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: windowWidth * 0.1, // Add horizontal padding based on screen width
  },
  image: {
    width: windowWidth * 0.8, // Set image width to 80% of screen width
    height: windowHeight * 0.4, // Set image height to 40% of screen height
    marginBottom: 20,
    resizeMode: 'contain',
  },
  message: {
    fontSize: 18, // Increase font size for better readability
    textAlign: 'center',
    marginTop: 20, // Add margin to separate image and message
    color: COLORS.primaryThemeColor, // Set message color to a subtle gray
    fontFamily: FONT_FAMILY.urbanistMedium
  },
});

export default EmptyState;
