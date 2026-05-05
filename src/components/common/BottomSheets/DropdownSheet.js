import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { BottomSheetModal, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { FONT_FAMILY } from '@constants/theme';
import { NavigationHeader } from '@components/Header';
import { SearchContainer } from '@components/containers';

const DropdownSheet = ({
    isVisible,
    items,
    onValueChange,
    title,
    placeholder = 'Search...',
    search = false,
    onSearchText = () => { },
    onClose = () => { }
}) => {
    const bottomSheetModalRef = useRef(null);
    const snapPoints = useMemo(() => ['25%', '30%', '50%', '96%'], []);

    useEffect(() => {
        if (isVisible) {
            bottomSheetModalRef.current?.present();
        } else {
            bottomSheetModalRef.current?.dismiss();
        }
    }, [isVisible]);

    const handleSheetChanges = useCallback((index) => {
        if (index === -1) onClose()
    }, []);

    const handleSelectItem = (item) => {
        onValueChange(item);
        onClose()
        bottomSheetModalRef.current?.dismiss();
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity style={styles.item} onPress={() => handleSelectItem(item)} >
            <Text style={styles.text}>{item.label?.trim()}</Text>
        </TouchableOpacity>
    );

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            index={2}
            snapPoints={snapPoints}
            onChange={handleSheetChanges}
        // backgroundStyle='left'
        >
            {/* <BottomSheetHeader title={title} /> */}
            <NavigationHeader title={title} onBackPress={() => bottomSheetModalRef.current?.dismiss()} />
            {search && <SearchContainer placeholder={placeholder} onChangeText={onSearchText} />}
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
        marginVertical: 10
    },
    item: {
        marginVertical: 3,
        backgroundColor: "white",
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
    },
    image: {
        height: 50,
        width: 50,
        marginRight: 20,
    },
    text: {
        fontFamily: FONT_FAMILY.urbanistBold,
        fontSize: 16
    },
});

export default DropdownSheet;