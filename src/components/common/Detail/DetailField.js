import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Text from '@components/Text';
import { COLORS } from '@constants/theme';
import { FONT_FAMILY } from '@constants/theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const DetailField = ({
  label,
  iconName,
  labelColor,
  ...props
}) => {

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          editable={false}
          autoCorrect={false}
          style={styles.input}
          {...props}
        />
        {iconName && (
          <Icon
            name={iconName}
            size={30}
            style={{ color: COLORS.icon, marginRight: 0 }}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    flex: 2 / 3,
    marginVertical: 8,
    fontSize: 16,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  inputContainer: {
    flex: 3 / 3,
    minHeight: 45,
    flexDirection: 'row',
    paddingHorizontal: 15,
    borderRadius: 6,
    borderWidth: 0.8,
    backgroundColor: 'white',
    alignItems: 'center',
    borderColor: '#dadada'
  },
  input: {
    color: COLORS.black,
    flex: 1,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginVertical: 5,
    // marginTop: 10,
    // textAlignVertical: 'top',

  },
});

export default DetailField;
