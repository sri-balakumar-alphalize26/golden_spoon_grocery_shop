// Source picker for ID-proof capture — Camera / Gallery / Cancel.
//
// Visual identity matches LogoutModal:
//   - react-native-modal with slideInUp animation
//   - White card, navy 2px border, rounded 10
//   - Navy filled buttons in a vertical stack
//   - Backdrop opacity 0.7
//
// Replaces the previous ActionSheetIOS / Alert.alert prompt which
// looked like a system menu and clashed with the rest of the app's
// modal styling.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import RNModal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const IdProofSourcePopup = ({ visible, title, onCamera, onGallery, onClose }) => {
  return (
    <RNModal
      isVisible={visible}
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
      <View style={styles.container}>
        <Text style={styles.title}>{title || 'Add ID Proof'}</Text>
        <Text style={styles.subtitle}>Choose a source</Text>

        <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={onCamera}>
          <MaterialIcons name="photo-camera" size={18} color="#fff" />
          <Text style={styles.btnText}>CAMERA</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={onGallery}>
          <MaterialIcons name="photo-library" size={18} color="#fff" />
          <Text style={styles.btnText}>GALLERY</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.cancelBtn]} activeOpacity={0.85} onPress={onClose}>
          <Text style={[styles.btnText, styles.cancelBtnText]}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </RNModal>
  );
};

export default IdProofSourcePopup;

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderColor: NAVY,
    borderWidth: 2,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 17,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'center',
    marginBottom: 18,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    fontSize: 13,
  },
  cancelBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  cancelBtnText: {
    color: NAVY,
  },
});
