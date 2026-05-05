import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Modal from 'react-native-modal';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { FONT_FAMILY } from '@constants/theme';

const CompleteModal = ({ isVisible, onConfirm, onCancel, headerMessage = 'Are you sure want to Confirm Sent for Approval ?' }) => {
    return (
        <Modal
            isVisible={isVisible}
            animationIn="slideInDown"
            animationOut="slideOutDown"
            backdropOpacity={0.7}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={100}
            backdropTransitionOutTiming={300}
        >
            <View style={styles.modalContainer}>
                <NavigationHeader onBackPress={() => onCancel()} title={'Confirmation'} />
                <View style={styles.modalContent}>
                    <Text style={styles.modalHeader}>{headerMessage}</Text>
                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={styles.modalButton} onPress={onConfirm}>
                            <Text style={styles.modalButtonText}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalButton} onPress={onCancel}>
                            <Text style={styles.modalButtonText}>No</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = {
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: 'white',
        padding: 18,
        borderBottomRightRadius: 10,
        borderBottomLeftRadius: 10,
        width: '100%',
    },
    modalHeader: {
        fontSize: 18,
        fontFamily: FONT_FAMILY.urbanistMedium,
        marginBottom: 15,
        alignSelf: 'center'
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    modalButton: {
        marginHorizontal: 10,
        backgroundColor: '#2e294e',
        padding: 10,
        borderRadius: 5,
        flex: 1,
        alignItems: 'center',
    },
    modalButtonText: {
        color: 'white',
        fontFamily: FONT_FAMILY.urbanistBold
    },
};

export default CompleteModal;
