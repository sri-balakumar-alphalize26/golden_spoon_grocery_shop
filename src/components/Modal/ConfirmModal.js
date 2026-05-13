// ConfirmModal — generic centered-card confirm/destructive popup that
// matches LogoutModal's visual language (white card, navy border, two
// equal-flex buttons at the bottom). Replaces ad-hoc Alert.alert calls
// so the app shows one consistent confirm UI everywhere.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const ConfirmModal = ({
  isVisible,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      isVisible={!!isVisible}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      backdropOpacity={0.7}
      animationInTiming={400}
      animationOutTiming={300}
      backdropTransitionInTiming={400}
      backdropTransitionOutTiming={300}
      onBackButtonPress={onCancel}
      onBackdropPress={onCancel}
    >
      <View style={styles.alertContainer}>
        {title ? <Text style={styles.alertTitle}>{title}</Text> : null}
        {message ? <Text style={styles.alertText}>{message}</Text> : null}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.alertButton, styles.cancelButton, { flex: 1 }]}
            onPress={onCancel}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.alertButton,
              destructive ? styles.destructiveButton : styles.confirmButton,
              { flex: 1 },
            ]}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default ConfirmModal;

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
    textAlign: 'center',
    marginBottom: 6,
  },
  alertText: {
    marginVertical: 10,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistRegular || FONT_FAMILY.urbanistBold,
    color: '#334155',
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  alertButton: {
    borderRadius: 10,
    padding: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  confirmButton: {
    backgroundColor: COLORS.primaryThemeColor,
  },
  destructiveButton: {
    backgroundColor: '#dc2626',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: COLORS.primaryThemeColor,
  },
  confirmButtonText: {
    color: 'white',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  cancelButtonText: {
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});
