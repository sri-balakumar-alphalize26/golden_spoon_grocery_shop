// StyledConfirmModal.js
// Reusable slide-up confirm popup styled like LogoutModal.
// Pass a message + confirm/cancel labels — useful for any one- or two-button
// dialog that should look consistent with the rest of the app's modals.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Modal from 'react-native-modal';
import Text from '@components/Text';

const StyledConfirmModal = ({
    isVisible,
    title,
    message,
    confirmLabel = 'OK',
    cancelLabel,
    onConfirm,
    onCancel,
}) => {
    const handleConfirm = onConfirm || onCancel || (() => {});
    const handleCancel = onCancel || onConfirm || (() => {});
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
            onBackButtonPress={handleCancel}
            onBackdropPress={handleCancel}
        >
            <View style={styles.alertContainer}>
                {title ? <Text style={styles.alertTitle}>{title}</Text> : null}
                {message ? <Text style={styles.alertText}>{message}</Text> : null}
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.alertButton, { flex: 1 }]}
                        onPress={handleConfirm}
                    >
                        <Text style={styles.alertButtonText}>{confirmLabel}</Text>
                    </TouchableOpacity>
                    {cancelLabel ? (
                        <TouchableOpacity
                            style={[styles.alertButton, { flex: 1 }]}
                            onPress={handleCancel}
                        >
                            <Text style={styles.alertButtonText}>{cancelLabel}</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
};

export default StyledConfirmModal;

const styles = StyleSheet.create({
    alertContainer: {
        backgroundColor: COLORS.white,
        borderRadius: 10,
        borderColor: COLORS.primaryThemeColor,
        borderWidth: 2,
        paddingVertical: 22,
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    alertTitle: {
        fontSize: 17,
        fontFamily: FONT_FAMILY.urbanistBold,
        color: COLORS.primaryThemeColor,
        marginBottom: 8,
        textAlign: 'center',
    },
    alertText: {
        marginVertical: 12,
        fontSize: 15,
        fontFamily: FONT_FAMILY.urbanistBold,
        textAlign: 'center',
        lineHeight: 21,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
        alignSelf: 'stretch',
    },
    alertButton: {
        backgroundColor: COLORS.primaryThemeColor,
        borderRadius: 10,
        padding: 15,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 5,
    },
    alertButtonText: {
        color: 'white',
        fontFamily: FONT_FAMILY.urbanistBold,
    },
});
