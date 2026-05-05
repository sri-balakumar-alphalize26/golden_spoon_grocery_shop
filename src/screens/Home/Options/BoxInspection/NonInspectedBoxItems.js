import React from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import Text from '@components/Text';
import { AntDesign } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NonInspectedBoxItems = ({ item, onPress, onQuantityChange }) => {
    return (
        <TouchableOpacity activeOpacity={1} onPress={onPress}>
            <View style={styles.itemContainer}>
                <Text style={styles.title}>{item.product_name}</Text>
                <View style={styles.itemRow}>
                    <Text style={styles.label}>Actual Quanity{' '}({item?.quantity || '0'})</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ backgroundColor: '#f3f3f3', padding: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity onPress={() => onQuantityChange(item._id, Math.max(0, item.inspectedQuantity - 1))}>
                                <AntDesign name="minus" size={20} color={COLORS.black} />
                            </TouchableOpacity>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Quantity"
                                    value={item?.inspectedQuantity?.toString()}
                                    onChangeText={(text) => onQuantityChange(item._id, text)}
                                    keyboardType="numeric"
                                />
                            </View>
                            <TouchableOpacity onPress={() => onQuantityChange(item._id, item.inspectedQuantity + 1)}>
                                <AntDesign name="plus" size={20} color={COLORS.black} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Text style={styles.label}>{item?.uom_name}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    itemContainer: {
        marginHorizontal: 5,
        marginVertical: 5,
        backgroundColor: COLORS.white,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.white,
        ...Platform.select({
            android: {
                elevation: 4,
            },
            ios: {
                shadowColor: 'black',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
            },
        }),
        padding: 20,
    },
    title: {
        fontFamily: FONT_FAMILY.urbanistBold,
        fontSize: 16,
        marginBottom: 5,
        color: COLORS.black
    },
    label: {
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        fontSize: 15,
        marginBottom: 5,
        color: COLORS.black
    },
    itemRow: {
        marginHorizontal: 10,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        marginVertical: 5
    },
    quantityInput: {
        borderWidth: 1,
        borderColor: 'black',
        borderRadius: 5,
        padding: 5,
        width: 100,
        marginRight: 100,
    },
    chooseButton: {
        backgroundColor: 'white',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 5,
    },
    chooseButtonText: {
        color: 'white',
    },
    pressed: {
        backgroundColor: 'white',
    },
    inputContainer: {
        borderColor: COLORS.boxTheme,
        borderWidth: 0.8,
        justifyContent: "center",
        alignItems: "center",
        marginHorizontal: 12,
        width: 45,
        borderRadius: 5
    },
    textInput: {
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: FONT_FAMILY.urbanistSemiBold
    },
});

export default NonInspectedBoxItems;
