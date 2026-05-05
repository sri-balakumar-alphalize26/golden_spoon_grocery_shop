import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

const { width } = Dimensions.get('window');

const ImageContainer = ({ source, onPress, backgroundColor, title }) => (
  <View style={styles.imageContainer}>
    <Image source={source} style={styles.image} />
    <TouchableOpacity style={[styles.buttonContainer, { backgroundColor }]} onPress={onPress}>
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  imageContainer: {
    height: 100,
    width: width * 0.3,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'black',
    borderWidth: 0.5,
    borderRadius: 10
  },
  image: {
    width: width * 0.25,
    height: width * 0.11,
    resizeMode: 'contain',
  },
  buttonContainer: {
    width: '85%',
    paddingVertical: 5,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 5,
  },
  buttonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.urbanistBold
  },
});

export default ImageContainer;
