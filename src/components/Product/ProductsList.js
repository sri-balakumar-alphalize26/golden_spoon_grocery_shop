import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';

const ProductsList = ({ item, onPress, showQuickAdd, onQuickAdd }) => {
    const url = typeof item?.image_url === 'string' ? item.image_url : '';
    const hasRealImage = url.startsWith('data:image') || url.startsWith('http') || url.startsWith('/');
    const [imageFailed, setImageFailed] = useState(!hasRealImage);

    useEffect(() => {
        setImageFailed(!hasRealImage);
    }, [url]);

    const productName = item?.product_name?.trim() || item?.name?.trim() || '';
    const priceValue = Number(item?.price ?? item?.list_price ?? item?.lst_price ?? 0);
    const stockQty = item?.qty_available ?? item?.total_product_quantity ?? null;

    return (
        <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.7}>
            {showQuickAdd && (
                <TouchableOpacity style={styles.plusBtn} onPress={() => onQuickAdd?.(item)}>
                    <Text style={styles.plusText}>+</Text>
                </TouchableOpacity>
            )}
            <View style={styles.imageWrapper}>
                {imageFailed ? (
                    <Text style={styles.noImageText}>No Image</Text>
                ) : (
                    <Image
                        source={{ uri: url }}
                        style={styles.image}
                        onError={() => setImageFailed(true)}
                    />
                )}
                {stockQty !== null && (
                    <View
                        style={[
                            styles.stockBadge,
                            { backgroundColor: stockQty > 0 ? '#4CAF50' : '#F44336' },
                        ]}
                    >
                        <Text style={styles.stockText}>{stockQty}</Text>
                    </View>
                )}
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.name} numberOfLines={2}>{productName}</Text>
                <Text style={styles.price}>{priceValue.toFixed(2)}</Text>
            </View>
        </TouchableOpacity>
    );
};

export default ProductsList;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        margin: 5,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#f0f0f0',
        overflow: 'hidden',
        ...Platform.select({
            android: { elevation: 3 },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
        }),
    },
    imageWrapper: {
        width: '100%',
        height: 110,
        backgroundColor: '#f9f9f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '80%',
        height: 100,
        resizeMode: 'contain',
    },
    noImageText: {
        color: '#999',
        fontSize: 12,
        fontFamily: FONT_FAMILY.urbanistMedium,
    },
    textContainer: {
        width: '100%',
        paddingHorizontal: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    name: {
        fontSize: 12,
        textAlign: 'center',
        color: '#2e2a4f',
        fontFamily: FONT_FAMILY.urbanistBold,
        lineHeight: 16,
    },
    price: {
        fontSize: 13,
        textAlign: 'center',
        color: COLORS.primaryThemeColor,
        marginTop: 4,
        fontFamily: FONT_FAMILY.urbanistExtraBold,
    },
    plusBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.primaryThemeColor,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        ...Platform.select({
            android: { elevation: 4 },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
        }),
    },
    plusText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        lineHeight: 22,
    },
    stockBadge: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    stockText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: FONT_FAMILY.urbanistBold,
    },
});
