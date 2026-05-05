import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Text from '@components/Text';
import Modal from 'react-native-modal';
import { Button } from '@components/common/Button';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { NavigationHeader } from '@components/Header';

const UpdatesModal = ({ isVisible, onClose, onSubmit, title, header = ''}) => {
    const [updateText, setUpdateText] = useState('');
    const [errorText, setErrorText] = useState('');

    const resetUpdateText = () => {
        setUpdateText('');
        setErrorText('');
    };

    const handleSave = () => {
        let hasError = false;

        if (!updateText) {
            setErrorText('Updates Required');
            hasError = true;
        } else {
            setErrorText('');
        }

        if (!hasError) {
            onSubmit(updateText);
            resetUpdateText()
            onClose();
        }
    };

    return (
        <Modal
            isVisible={isVisible}
            animationIn="slideInDown"
            animationOut="slideOutDown"
            backdropOpacity={0.7}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={400}
            backdropTransitionOutTiming={300}
        >
            <View style={styles.modalContainer}>
                <NavigationHeader onBackPress={onClose} title={header} />
                <View style={styles.modalContent}>
                    <Text style={styles.label}>{title}</Text>
                    <TextInput
                        value={updateText}
                        onChangeText={(text) => {
                            setUpdateText(text);
                            setErrorText('');
                        }}
                        multiline={true}
                        style={[styles.textInput, errorText && styles.textInputError]}
                    />
                    {errorText ? (
                        <View style={styles.errorContainer}>
                            <Icon name="error" size={20} color="red" />
                            <Text style={styles.errorText}>{errorText}</Text>
                        </View>
                    ) : null}
                    <View style={styles.buttonRow}>
                        <View style={{ flex: 3 }}>
                            <Button title="Save" onPress={handleSave} />
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
        borderBottomRightRadius: 10,
        borderBottomLeftRadius: 10,
        width: '100%',
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
    },
    errorText: {
        color: 'red',
        marginLeft: 10,
    },
    buttonRow: {
        flexDirection: 'row',
        marginTop: 10,
    },
    label: {
        marginVertical: 5,
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
});

export default UpdatesModal;
