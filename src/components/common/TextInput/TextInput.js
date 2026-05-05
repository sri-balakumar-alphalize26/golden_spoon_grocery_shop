import React from 'react';
import { View, TextInput as RNTextInput, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import Text from '@components/Text';
import { COLORS } from '@constants/theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { FONT_FAMILY } from '@constants/theme';

const TextInput = ({
    label,
    labelColor,
    iconName,
    error,
    onPress,
    password,
    dropIcon,
    login,
    validate,
    column = true,
    required = false,
    onFocus = () => { },
    ...props
}) => {
    const [hidePassword, setHidePassword] = React.useState(password);
    const [isFocused, setIsFocused] = React.useState(false);

    // const inputColor = login ? COLORS.primaryThemeColor : COLORS.black;

    // Define a handler to clear error state and focus the input when pressed
    const handlePress = () => {
        // Call the onFocus function
        if (onFocus) {
            onFocus();
        }
        if (onPress) {
            onPress()
        }
    };

    return (
        <View style={[styles.container, { flexDirection: column ? 'column' : 'row' }]}>
            <View style={styles.labelContainer}>
                <Text style={[styles.label, { color: labelColor }]}>
                    {label}
                    {required && <Text style={styles.requiredAsterisk}>*</Text>} {/* Asterisk for mandatory fields */}
                </Text>
            </View>
            <TouchableWithoutFeedback onPress={handlePress}>
                <View
                    style={[
                        styles.inputContainer,
                        {
                            borderColor: error || validate
                                ? COLORS.red
                                : isFocused
                                    ? COLORS.primaryThemeColor
                                    : '#BBB7B7',
                        },
                    ]}
                >
                    <RNTextInput
                        autoCorrect={false}
                        onFocus={() => {
                            onFocus();
                            setIsFocused(true);
                        }}
                        onBlur={() => setIsFocused(false)}
                        secureTextEntry={hidePassword}
                        style={styles.input}
                        placeholderTextColor={'#666666'}
                        {...props}
                    />
                    {!validate && dropIcon && (
                        <Icon
                            name={dropIcon}
                            size={30}
                            style={{ color: COLORS.icon, marginRight: 0 }}
                        />
                    )}

                    {password && (
                        <Icon
                            onPress={() => setHidePassword(!hidePassword)}
                            name={!hidePassword ? 'eye-outline' : 'eye-off-outline'}
                            style={{ color: COLORS.primaryThemeColor, fontSize: 22 }}
                        />
                    )}
                    {validate && (
                        <Icon
                            name={'alert-circle'}
                            size={30}
                            style={{ color: COLORS.red, marginRight: 0 }}
                        />
                    )}
                </View>
            </TouchableWithoutFeedback>
            {error && (
                <Text style={styles.errorText}>{error}</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 3,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    label: {
        flex: 2 / 3,
        marginVertical: 5,
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    inputContainer: {
        flex: 3 / 3,
        minHeight: 43,
        flexDirection: 'row',
        paddingHorizontal: 15,
        borderRadius: 6,
        borderWidth: 0.8,
        backgroundColor: 'white',
        alignItems: 'center',
    },
    input: {
        color: COLORS.black,
        flex: 1,
        fontFamily: FONT_FAMILY.urbanistMedium,
        // marginTop: 10,
        marginVertical: 5,
        // textAlignVertical: 'center',
        // fontSize:16
    },
    requiredAsterisk: {
        color: COLORS.red,
        fontSize: 16,
        marginLeft: 5,
    },
    errorText: {
        color: COLORS.red,
        fontSize: 12,
        marginTop: 5,
        fontFamily: FONT_FAMILY.urbanistMedium
    },

});

export default TextInput;
