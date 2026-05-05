import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { BottomSheetModal, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { NavigationHeader } from '@components/Header';
import { Checkbox } from 'react-native-paper';

const MultiSelectDropdownSheet = ({
    isVisible,
    items,
    onValueChange,
    title,
    refreshIcon = true,
    onClose = () => { },
    previousSelections = []  // Prop to pass previous selections
}) => {
    const bottomSheetModalRef = useRef(null);
    const snapPoints = useMemo(() => ['25%', '30%', '50%', '96%'], []);

    const [selectedItems, setSelectedItems] = useState(previousSelections);  // Initialize with previous selections

    useEffect(() => {
        if (isVisible) {
            setSelectedItems(previousSelections);  // Set previous selections when visible
            bottomSheetModalRef.current?.present();
        } else {
            bottomSheetModalRef.current?.dismiss();
            setSelectedItems([]);  // Clear selections on close
        }
    }, [isVisible, previousSelections]);

    const handleSheetChanges = useCallback((index) => {
        if (index === -1) {
            onClose();
        }
    }, [onClose]);

    const handleSelectItem = (item) => {
        const isSelected = selectedItems.includes(item);
        const newSelectedItems = isSelected
            ? selectedItems.filter(i => i !== item)
            : [...selectedItems, item];
        setSelectedItems(newSelectedItems);
        onValueChange(newSelectedItems);
    };

    const renderItem = ({ item }) => {
        const isSelected = selectedItems.includes(item);
        return (
            <TouchableOpacity style={styles.item} onPress={() => handleSelectItem(item)}>
                <Text style={styles.text}>{item.label?.trim()}</Text>
                <Checkbox
                    status={isSelected ? 'checked' : 'unchecked'}
                    onPress={() => handleSelectItem(item)}
                    color={COLORS.primaryThemeColor}
                />
            </TouchableOpacity>
        );
    };

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            index={2}
            snapPoints={snapPoints}
            onChange={handleSheetChanges}
        >
            <NavigationHeader
                title={title}
                logo={false}
                refreshIcon={refreshIcon}
                refreshPress={() => setSelectedItems([])}
                checkIcon={true}
                checkPress={onClose}
                onBackPress={() => bottomSheetModalRef.current?.dismiss()}
            />
            <BottomSheetFlatList
                data={items}
                numColumns={1}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            />
        </BottomSheetModal>
    );
};

const styles = StyleSheet.create({
    contentContainer: {
        paddingBottom: 20,
        marginVertical: 10,
    },
    item: {
        marginVertical: 3,
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 20,
        marginHorizontal: 10,
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    text: {
        fontFamily: FONT_FAMILY.urbanistBold,
        fontSize: 16,
        flex: 1,
        flexWrap: 'wrap',
    },
});

export default MultiSelectDropdownSheet;
