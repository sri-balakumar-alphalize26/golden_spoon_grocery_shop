// SourcePickerModal.js — reusable Camera / Gallery / File chooser styled to
// match LogoutModal. Includes both an X close icon (top-right) and a Cancel
// button (bottom) so the user always has a clear dismiss path.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

const SourcePickerModal = ({
  isVisible,
  onClose,
  onPickCamera,
  onPickGallery,
  onPickFile,
  title = 'Attach Receipt',
}) => {
  // Close the modal first, then trigger the OS picker on the next tick so
  // the picker doesn't race with the dismiss animation.
  const handle = (fn) => () => {
    onClose?.();
    setTimeout(() => fn && fn(), 50);
  };

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
      onBackButtonPress={onClose}
      onBackdropPress={onClose}
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeBtn}
          >
            <MaterialIcons name="close" size={20} color={COLORS.primaryThemeColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.optionList}>
          <Option icon="photo-camera" label="Camera" onPress={handle(onPickCamera)} />
          <Option icon="photo-library" label="Gallery" onPress={handle(onPickGallery)} />
          <Option icon="insert-drive-file" label="File (PDF, Excel…)" onPress={handle(onPickFile)} />
        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const Option = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.optionBtn} onPress={onPress} activeOpacity={0.85}>
    <MaterialIcons name={icon} size={20} color="#fff" />
    <Text style={styles.optionText}>{label}</Text>
  </TouchableOpacity>
);

export default SourcePickerModal;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderColor: COLORS.primaryThemeColor,
    borderWidth: 2,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionList: { gap: 10, marginTop: 4, marginBottom: 14 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  optionText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  cancelBtn: {
    borderWidth: 2,
    borderColor: COLORS.primaryThemeColor,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  cancelText: {
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
});
