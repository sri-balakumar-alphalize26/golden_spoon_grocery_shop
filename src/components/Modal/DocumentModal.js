import React, { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { View, TouchableOpacity, StyleSheet, FlatList, Dimensions, Platform, Image } from 'react-native';
import Modal from 'react-native-modal';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { uploadApi } from '@api/uploads';

const DocumentModal = ({ title, setDocumentUrl }) => {
    const [isActionVisible, setIsActionVisible] = useState(false)
    const screenHeight = Dimensions.get('window').height;

    const pickDocument = async () => {
        console.log("Opening document picker..."); 
        toggleModal();
        let result = await DocumentPicker.getDocumentAsync({
            type: '*/*', 
        });
        handleDocumentPicked(result);
    };
    

    const handleDocumentPicked = async (pickerResult) => {
        console.log("Document picker result:", pickerResult); 
        if (pickerResult.assets && pickerResult.assets.length > 0) {
            const documentUri = pickerResult.assets[0].uri; 
            console.log("Document URI:", documentUri); 
            try {
                if (documentUri) {
                    const url = await uploadApi(documentUri); 
                    console.log("Uploaded document URL:", url); 
                    if (url) {
                        setDocumentUrl(url);
                    } else {
                        console.error('Upload API response is empty or undefined.');
                    }
                } else {
                    console.warn('Invalid document');
                }
            } catch (error) {
                console.error('Error occurred during document upload:', error);
            }
        } else {
            console.warn('No document selected or picker was canceled.');
        }
    };
     
    const options = [
        { title: 'Upload Document', image: require('@assets/icons/modal/file_upload.png'), onPress: () => pickDocument() },
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
                <Image source={require('@assets/icons/modal/document.png')} style={{ width: 80, height: 80, tintColor: COLORS.orange }} />
            </TouchableOpacity>
        </>
    );
};

export default DocumentModal;

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
        margin: 8,
        borderStyle: 'dotted'
    },
    image: {
        width: 25,
        height: 25,
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