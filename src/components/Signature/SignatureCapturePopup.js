// Signature capture popup — rises automatically after a customer is
// selected in POS checkout. The heading shows the selected customer's
// name, and the body hosts the two signature cards (Customer + Shop
// Owner). Values are lifted to the parent via onChange as each card is
// signed; the Done button just dismisses the popup.
//
// Visual identity matches IdProofSourcePopup (slide-up RNModal, white
// card, navy border).
//
// Props:
//   visible            — show / hide
//   customerName       — name of the selected customer (heading)
//   owner, customer    — base64 PNG strings or null
//   onChange(role,b64) — passed straight to SignatureCards
//   onClose            — dismiss the popup (Done / backdrop / back)
//   busy               — disables actions during a save
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import RNModal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import SignatureCards from './SignatureCards';

const NAVY = COLORS.primaryThemeColor;

const SignatureCapturePopup = ({
  visible,
  customerName,
  owner,
  customer,
  onChange,
  onClose,
  busy = false,
}) => {
  const bothSigned = !!owner && !!customer;
  return (
    <RNModal
      isVisible={visible}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      backdropOpacity={0.7}
      onBackButtonPress={onClose}
      onBackdropPress={onClose}
      // Keep the inner signature-pad modal above this one.
      style={styles.modal}
    >
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <MaterialIcons name="gesture" size={20} color={NAVY} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              Signatures{customerName ? ` — ${customerName}` : ''}
            </Text>
            <Text style={styles.subtitle}>
              Capture the customer and cashier signatures
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="close" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <SignatureCards
            owner={owner}
            customer={customer}
            onChange={onChange}
            busy={busy}
          />
        </View>

        <TouchableOpacity
          style={[styles.doneBtn, bothSigned && styles.doneBtnReady]}
          activeOpacity={0.85}
          onPress={onClose}
        >
          <MaterialIcons
            name={bothSigned ? 'check-circle' : 'check'}
            size={18}
            color="#fff"
          />
          <Text style={styles.doneBtnText}>DONE</Text>
        </TouchableOpacity>
      </View>
    </RNModal>
  );
};

export default SignatureCapturePopup;

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  container: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderColor: NAVY,
    borderWidth: 2,
    borderBottomWidth: 0,
    paddingVertical: 18,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  subtitle: {
    fontSize: 12,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  body: { marginBottom: 16 },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
  },
  doneBtnReady: { backgroundColor: '#16A34A' },
  doneBtnText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    fontSize: 13,
  },
});
