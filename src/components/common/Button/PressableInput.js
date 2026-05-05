import React from 'react';
import { View, TextInput as RNTextInput, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { COLORS } from '@constants/theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { FONT_FAMILY } from '@constants/theme';

const PressableInput = ({
    iconName,
    onPress,
    dropIcon,
    handlePress = () => { },
    ...props
}) => {

    return (
        <TouchableWithoutFeedback onPress={handlePress}>
            <View
                style={[
                    styles.inputContainer,
                    {
                        borderColor: '#BBB7B7',
                    },
                ]}
            >
                <RNTextInput
                    autoCorrect={false}
                    style={styles.input}
                    placeholderTextColor={'#666666'}
                    editable={false}
                    {...props}
                />
                {dropIcon && (
                    <Icon
                        name={dropIcon}
                        size={30}
                        style={{ color: COLORS.icon, marginRight: 0 }}
                    />
                )}
            </View>
        </TouchableWithoutFeedback>
    );
};

const styles = StyleSheet.create({
    inputContainer: {
        flex: 1,
        minHeight: 35,
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
        marginTop: 10,
        textAlignVertical: 'top',
    },
});

export default PressableInput;
