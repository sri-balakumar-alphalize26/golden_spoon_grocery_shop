import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const SearchContainer = ({ placeholder, onChangeText }) => {
    return (
        <View style={styles.searchContainer}>
            <View style={styles.searchInput}>
                <AntDesign name="search1" size={20} color="#888" style={styles.searchIcon} />
                <TextInput
                    style={styles.input}
                    placeholder={placeholder}
                    placeholderTextColor="#888"
                    onChangeText={onChangeText}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    searchContainer: {
        backgroundColor: COLORS.primaryThemeColor,
        padding: 10,
        paddingHorizontal: 20
    },
    searchInput: {
        backgroundColor: COLORS.white,
        borderRadius: 8,
        padding: 10,
        flexDirection: "row",
        alignItems: 'center',
    },
    searchIcon: {
        marginLeft: 15,
        marginRight: 10
    },
    input: {
        flex: 1,
        fontFamily: FONT_FAMILY.urbanistRegular
    },
});

export default SearchContainer;
