import React from 'react';
import { FAB } from 'react-native-paper';
import { COLORS } from '@constants/theme';
import { MaterialIcons } from "@expo/vector-icons";

const FABButton = ({ onPress, style }) => {
    return (
        <FAB
            style={[styles.fab, style]}
            icon={() => <MaterialIcons name="add" size={24} color="white" />}
            onPress={onPress}
            animated={true}
        />
    );
};

const styles = {
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
        backgroundColor: COLORS.primaryThemeColor,
        borderRadius: 30,
        width: 60,
        height: 60,
        
    },
};

export default FABButton;
