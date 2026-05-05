// DetailCheckBox.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Checkbox } from 'react-native-paper';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const DetailCheckBox = ({ label, checked }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            <View style={{ marginRight: '40%' }}>
                <Checkbox
                    status={checked ? 'checked' : 'unchecked'}
                    disabled={true}
                    color={COLORS.primaryThemeColor}
                />
            </View>
        </View>
    );
};

export default DetailCheckBox;


const styles = StyleSheet.create({
    container: {
        marginBottom: 5,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        flex: 2 / 3,
        marginVertical: 8,
        fontSize: 14,
        color: '#818181',
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
    },
    input: {
        color: COLORS.primaryThemeColor,
        flex: 1,
        fontFamily: FONT_FAMILY.urbanistRegular,
        marginTop: 10,
        textAlignVertical: 'top',
    },
});
