import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, Dimensions, Platform, Image } from 'react-native';
import Modal from 'react-native-modal';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { uploadApi } from '@api/uploads';

const ActionModal = ({ title, setImageUrl }) => {
    const [isActionVisible, setIsActionVisible] = useState(false)
    const screenHeight = Dimensions.get('window').height;

    const takePhoto = async () => {
        toggleModal();
        let result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            aspect: [4, 3],
            base64: true,
            quality: 1,
        });
        handleImagePicked(result);
    };

    const pickImage = async () => {
        toggleModal();
        let result = await ImagePicker.launchImageLibraryAsync({
            base64: true,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            aspect: [4, 3],
            quality: 1,
        });
        handleImagePicked(result);
    };

    const handleImagePicked = async (pickerResult) => {
        if (!pickerResult.cancelled) {
            const imagePath = pickerResult.assets[0].uri;
            console.log("🚀 ~ handleImagePicked ~ imagePath:", imagePath)
            try {
                if (imagePath) {
                    const url = await uploadApi(imagePath);
                    if (url) {
                        setImageUrl(url);
                    } else {
                        console.error('Upload API response is empty or undefined.');
                    }
                } else {
                    console.warn('Invalid')
                }
            } catch (error) {
                console.error('Error occurred during image upload:', error);
            }
        }
    };

    const options = [
        { title: 'Take Photo', image: require('@assets/icons/modal/camera.png'), onPress: () => takePhoto() },
        { title: 'Gallery', image: require('@assets/icons/modal/gallery_upload.png'), onPress: () => pickImage() },
        { title: 'Cancel', image: require('@assets/icons/modal/cancel.png'), onPress: () => toggleModal() },
    ]

    const ListAction = ({ title, image, onPress }) => {
        return (
            <TouchableOpacity style={styles.container} onPress={onPress}>
                <Image source={image} style={styles.image} />
                <Text style={styles.title}>{title}</Text>
            </TouchableOpacity>
        );
    };

    const toggleModal = () => {
        setIsActionVisible(!isActionVisible)
    }

    return (
        <>
            <Modal
                isVisible={isActionVisible}
                onBackdropPress={toggleModal}
                onSwipeComplete={toggleModal}
                swipeThreshold={300}
                swipeDirection={['down']}
                animationIn="slideInUp"
                animationOut="slideOutDown"
                style={{
                    margin: 0,
                    borderTopRightRadius: 30,
                    borderTopLeftRadius: 30,
                    backgroundColor: 'white',
                    justifyContent: 'flex-start',
                    marginTop: screenHeight / 1.8,
                }}
            >
                <View style={{ backgroundColor: COLORS.primaryThemeColor, borderTopRightRadius: 25, borderTopLeftRadius: 25, padding: 8 }}>
                    <NavigationHeader
                        title="Choose Options"
                        onBackPress={toggleModal}
                    />
                </View>
                <FlatList
                    data={options}
                    numColumns={3}
                    keyExtractor={(item, index) => index.toString()}
                    contentContainerStyle={{ padding: 8 }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (<ListAction title={item.title} image={item.image} onPress={item.onPress} />)}
                />
            </Modal>
            <Text style={styles.label}>{title}</Text>
            <TouchableOpacity style={{ width: 80, height: 80 }} onPress={toggleModal}>
                <Image source={require('@assets/icons/modal/image_upload.png')} style={{ width: 80, height: 80, tintColor: COLORS.orange }} />
            </TouchableOpacity>
        </>
    );
};

export default ActionModal;

export const styles = StyleSheet.create({
    modalContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.white,
        borderRadius: 20,
        padding: 20,
        ...Platform.select({
            android: {
                elevation: 4,
            },
            ios: {
                shadowColor: 'black',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
            },
        })
    },
    container: {
        borderColor: COLORS.primaryThemeColor,
        borderWidth: 1,
        height: 120,
        borderRadius: 30,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor: '#f1f1f1',
        margin: 8,
        borderStyle: 'dotted'
    },
    image: {
        width: 35,
        height: 35,
        tintColor: COLORS.primaryThemeColor,
        marginBottom: 15,
    },
    title: {
        fontSize: 18,
        fontFamily: FONT_FAMILY.urbanistBold,
        color: COLORS.black,
        alignSelf: 'center'
    },
    label: {
        marginVertical: 5,
        fontSize: 16,
        color: '#2e2a4f',
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
});
