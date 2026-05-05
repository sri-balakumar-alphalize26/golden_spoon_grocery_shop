import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Text from '@components/Text';
import Modal from 'react-native-modal';
import { Button } from '@components/common/Button';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { NavigationHeader } from '@components/Header';

const InputModal = ({ isVisible, onClose, onSubmit }) => {
    const [itemName, setItemName] = useState('');
    const [nameError, setNameError] = useState('');
    const handleSave = () => {
        let hasError = false;

        if (!itemName) {
            setNameError('Box no is required');
            hasError = true;
        } else {
            setNameError('');
        }
        if (!hasError) {
            onSubmit(itemName);
            onClose();
        }
    };

    return (
        <Modal
            isVisible={isVisible}
            animationIn="bounceIn"
            animationOut="slideOutDown"
            backdropOpacity={0.7}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={400}
            backdropTransitionOutTiming={300}
        >
            <View style={styles.modalContainer}>
            <NavigationHeader onBackPress={() => onClose()} title={'Enter Box no'}/>
                <View style={styles.modalContent}>
                    <Text style={styles.label}>Box No</Text>
                    <TextInput
                        placeholder={`Enter box no`}
                        autoCapitalize='characters'
                        value={itemName.name}
                        onChangeText={(text) => {
                            setItemName(text);
                            setNameError('');
                        }}
                        multiline
                        style={[styles.textInput, nameError && styles.textInputError]}
                    />
                    {nameError ? (
                        <View style={styles.errorContainer}>
                            <Icon name="error" size={20} color="red" />
                            <Text style={styles.errorText}>{nameError}</Text>
                        </View>
                    ) : null}
                    <View style={styles.buttonRow}>
                        <View style={{ flex: 3 }}>
                            <Button title="CANCEL" onPress={() => onClose()} />
                        </View>
                        <View style={{ width: 10 }} />
                        <View style={{ flex: 6 }}>
                            {itemName && <Button title="Show Inventory Details" onPress={handleSave} />}
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: 'white',
        padding: 20,
        // borderRadius: 10,
        borderBottomRightRadius: 10, 
        borderBottomLeftRadius: 10,
        width: '100%',
    },
    modalHeader: {
        fontSize: 18,
        fontFamily: FONT_FAMILY.urbanistMedium,
        marginBottom: 10,
    },
    textInput: {
        borderWidth: 1,
        borderColor: 'gray',
        marginBottom: 10,
        padding: 10,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        borderRadius: 5,
    },
    textInputError: {
        borderColor: 'red',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        // marginBottom: 10,
    },
    errorText: {
        color: 'red',
        marginLeft: 10,
    },
    buttonRow: {
        flexDirection: 'row',
    },
    button: {
        borderRadius: 10,
    },
    label: {
        // flex: 1,
        marginVertical: 5,
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
});

export default InputModal;
