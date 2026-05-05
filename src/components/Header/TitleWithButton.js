import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@components/Text';
import { AntDesign } from '@expo/vector-icons'; // Replace with your icons import
import { COLORS, FONT_FAMILY } from '@constants/theme';

const TitleWithButton = ({ label, onPress, disabled = false }) => {
    return (
        <View style={{ justifyContent: 'space-between', flexDirection: 'row', marginVertical: 10 }}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={disabled ? null : onPress} 
                style={[styles.button, disabled && styles.disabledButton]} 
            >
                <AntDesign name="pluscircle" size={26} color={disabled ? COLORS.grey : COLORS.orange} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    label: {
        marginVertical: 5,
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    button: {
        // You can add any specific styles for the button here
    },
    disabledButton: {
        opacity: 0.5, // Reduce opacity to indicate it's disabled
    },
});

export default TitleWithButton;
