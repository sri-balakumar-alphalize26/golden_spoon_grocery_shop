import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { FONT_FAMILY, COLORS } from '@constants/theme';

const VendorModal = ({ isVisible, onCancel, onOptionSelect, headerMessage = 'Select an Option' }) => {
    const options = ['Record Payment', 'PDF Download'];

    return (
        <Modal
            isVisible={isVisible}
            animationIn="slideInDown"
            animationOut="slideOutDown"
            backdropOpacity={0.9}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={100}
            backdropTransitionOutTiming={300}
        >
        <View style={styles.modalContainer}>
            <NavigationHeader onBackPress={onCancel} title="Menu" />
            <View style={styles.modalContent}>
                <Text style={styles.modalHeader}>{headerMessage}</Text>
                <View>
                    {options.map((option) => (
                        <TouchableOpacity
                            key={option}
                            style={styles.optionButton}
                            onPress={() => {
                                if (onOptionSelect) onOptionSelect(option);
                                onCancel(); // Close modal after selection
                            }}
                        >
                        <Text style={styles.optionText}>{option}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onCancel}>
                    <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
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
        width: '100%',
    },
    modalHeader: {
        fontSize: 18,
        fontFamily: FONT_FAMILY.urbanistMedium,
        marginBottom: 15,
        alignSelf: 'center',
    },
    optionButton: {
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: COLORS.lightGray,
    },
    optionText: {
        fontSize: 18,
        color: COLORS.primaryText,
        textAlign: 'center',
    },
    closeButton: {
        marginTop: 20,
        backgroundColor: COLORS.tabIndicator,
        padding: 10,
        borderRadius: 5,
    },
    closeButtonText: {
        color: 'white',
        textAlign: 'center',
        fontFamily: FONT_FAMILY.urbanistBold,
    },
});

export default VendorModal;