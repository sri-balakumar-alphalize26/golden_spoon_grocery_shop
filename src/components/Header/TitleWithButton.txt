import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { AntDesign } from '@expo/vector-icons'; // Replace with your icons import
import { COLORS, FONT_FAMILY } from '@constants/theme';

const TitleWithButton = ({ label, onPress }) => {
    return (
        <View style={{ justifyContent: 'space-between', flexDirection: 'row', marginVertical: 10 }}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
                <AntDesign name="pluscircle" size={26} color={COLORS.orange} />
            </TouchableOpacity>
        </View>
    );
};

const styles = {
    label: {
        marginVertical: 5,
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
      },
};

export default TitleWithButton;
