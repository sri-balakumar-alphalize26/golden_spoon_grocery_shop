
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const BottomSheetHeader = ({ title, plusIcon = false, onPress = () => { } }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
            {plusIcon && <Icon
                onPress={onPress}
                name="plus"
                style={{ color: COLORS.white }}
                size={30}
            />}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 10,
        backgroundColor: COLORS.primaryThemeColor,
        justifyContent: 'space-between',
        flexDirection: 'row',
        alignItems: 'center'
    },
    title: {
        color: COLORS.white,
        fontSize: 16,
        fontFamily: FONT_FAMILY.urbanistBold
    },
});

export default BottomSheetHeader;
