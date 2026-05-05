import React, { useState } from 'react';
import { View, FlatList, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const UploadsContainer = ({ imageUrls, onDelete, title = 'Uploads', deleteIcon = true, }) => {
    // State to manage image loading status
    const [loadingImages, setLoadingImages] = useState({});

    // Function to handle loading start
    const handleLoadStart = (index) => {
        setLoadingImages((prevState) => ({ ...prevState, [index]: true }));
    };

    // Function to handle loading end
    const handleLoadEnd = (index) => {
        setLoadingImages((prevState) => ({ ...prevState, [index]: false }));
    };

    // Function to render each image item
    const renderItem = ({ item, index }) => (
        <View style={styles.imageWrapper}>
            {loadingImages[index] && (
                <ActivityIndicator style={styles.imageLoader} size="small" color={COLORS.primaryThemeColor} />
            )}
            <Image
                source={{ uri: item }}
                style={styles.image}
                onLoadStart={() => handleLoadStart(index)}
                onLoadEnd={() => handleLoadEnd(index)}
                onError={() => handleLoadEnd(index)} // Also handle errors
            />
            {deleteIcon && <TouchableOpacity style={styles.deleteIcon} onPress={() => onDelete(index)}>
                <AntDesign name="delete" size={24} color="white" />
            </TouchableOpacity>}
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.label}>{title}</Text>
            <FlatList
                data={imageUrls}
                numColumns={4}
                keyExtractor={(item, index) => index.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.content}
            />
        </View>
    );
};

export default UploadsContainer;

const styles = StyleSheet.create({
    container: {
        borderWidth: 0.8,
        borderColor: '#BBB7B7',
        backgroundColor: 'white',
        marginVertical: 5,
        borderRadius: 6,
    },
    label: {
        fontSize: 16,
        fontFamily: FONT_FAMILY.urbanistBold,
        color: COLORS.black,
        padding: 10,
    },
    content: {
        padding: 10,
    },
    imageWrapper: {
        margin: 8,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: 90,
        height: 90,
    },
    image: {
        width: 90,
        height: 90,
        borderRadius: 8,
    },
    deleteIcon: {
        position: 'absolute',
        top: -10,
        right: -10,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 12,
        padding: 5,
    },
    imageLoader: {
        position: 'absolute',
        zIndex: 1,
    },
});
