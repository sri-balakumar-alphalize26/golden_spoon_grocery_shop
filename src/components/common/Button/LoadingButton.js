import React from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const LoadingButton = ({
  title,
  color = 'white',
  onPress = () => { },
  backgroundColor = COLORS.button,
  loading = false,
  ...props
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={loading}
      style={{
        height: 45,
        opacity: loading ? .70 : '',
        width: '100%',
        backgroundColor: backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 10,
        marginVertical: 10,
        paddingHorizontal: 8,
        ...props
      }}>
      {loading ? (
        <ActivityIndicator size="small" color={color} animating={loading} />
      ) : (
        <Text style={[styles.title, { color: color }]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold
  }
});

export default LoadingButton;
