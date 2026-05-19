// SessionClosedModal.js — styled confirmation popup shown after a POS session
// is closed. Visual sibling of LogoutModal so the user sees a consistent
// "card-style" popup instead of the native Alert.alert that was used before.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Modal from 'react-native-modal';
import Text from '@components/Text';

const SessionClosedModal = ({ isVisible, onDismiss, message }) => {
    return (
        <Modal
            isVisible={isVisible}
            animationIn="slideInUp"
            animationOut="slideOutDown"
            backdropOpacity={0.7}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={400}
            backdropTransitionOutTiming={300}
            onBackButtonPress={onDismiss}
            onBackdropPress={onDismiss}
        >
            <View style={styles.alertContainer}>
                <Text style={styles.alertTitle}>Register Closed</Text>
                <Text style={styles.alertText}>{message || 'Session closed successfully.'}</Text>
                <TouchableOpacity
                    style={styles.alertButton}
                    onPress={onDismiss}
                    activeOpacity={0.85}
                >
                    <Text style={styles.alertButtonText}>OK</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

export default SessionClosedModal;

const styles = StyleSheet.create({
    alertContainer: {
        backgroundColor: COLORS.white,
        borderRadius: 10,
        borderColor: COLORS.primaryThemeColor,
        borderWidth: 2,
        paddingVertical: 22,
        paddingHorizontal: 18,
        alignItems: 'center',
    },
    alertTitle: {
        fontSize: 17,
        fontFamily: FONT_FAMILY.urbanistBold,
        color: COLORS.primaryThemeColor,
        marginBottom: 6,
        letterSpacing: 0.3,
    },
    alertText: {
        marginTop: 4,
        marginBottom: 18,
        fontSize: 14,
        color: '#4b5563',
        fontFamily: FONT_FAMILY.urbanistMedium,
        textAlign: 'center',
    },
    alertButton: {
        backgroundColor: COLORS.primaryThemeColor,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 36,
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
    },
    alertButtonText: {
        color: 'white',
        fontFamily: FONT_FAMILY.urbanistBold,
        fontSize: 14,
        letterSpacing: 0.4,
    },
});
