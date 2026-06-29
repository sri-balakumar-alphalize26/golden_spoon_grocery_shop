// Two side-by-side signature cards (Customer + Shop Owner). Mirrors
// IdProofCards: an empty card shows a "Tap to sign" prompt that opens the
// SignaturePadModal; a filled card shows the signature thumbnail with
// Re-sign / Remove actions and a fullscreen viewer on tap.
//
// Props:
//   owner, customer     — base64 PNG strings (without `data:` prefix) or null
//   onChange(role, b64) — fires when a role is signed/cleared; role is
//                         'owner' | 'customer'; pass `null` to clear. The
//                         parent decides when to commit to Odoo.
//   readOnly            — disables sign/remove; cards still render existing
//                         signatures (used by the inline payment preview).
//   busy                — disables the action buttons during a save.
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import SignaturePadModal from './SignaturePadModal';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

const SignatureCard = ({ role, label, value, onChange, readOnly, busy }) => {
  const filled = !!value;
  const [viewerVisible, setViewerVisible] = useState(false);
  const [padVisible, setPadVisible] = useState(false);

  const handleSign = () => {
    if (readOnly) return;
    setPadVisible(true);
  };

  const handleConfirm = (base64) => {
    setPadVisible(false);
    if (base64) onChange(role, base64);
  };

  // The signature pad — mounted in both branches so it's reachable from
  // the empty card AND the Re-sign button.
  const padModal = (
    <SignaturePadModal
      visible={padVisible}
      title={label}
      onConfirm={handleConfirm}
      onClose={() => setPadVisible(false)}
    />
  );

  // Fullscreen viewer — signatures are dark ink on white, so the viewer
  // uses a white background (unlike the ID-proof black viewer).
  const viewerModal = filled ? (
    <Modal
      visible={viewerVisible}
      animationType="fade"
      transparent
      onRequestClose={() => setViewerVisible(false)}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <TouchableOpacity
        style={styles.viewerBg}
        activeOpacity={1}
        onPress={() => setViewerVisible(false)}
      >
        <Image
          source={{ uri: `data:image/png;base64,${value}` }}
          style={styles.viewerImg}
        />
        <TouchableOpacity
          style={styles.viewerClose}
          onPress={() => setViewerVisible(false)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialIcons name="close" size={26} color="#111" />
        </TouchableOpacity>
        <Text style={styles.viewerLabel}>{label}</Text>
      </TouchableOpacity>
    </Modal>
  ) : null;

  if (filled) {
    return (
      <>
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setViewerVisible(true)}
            style={{ alignSelf: 'stretch' }}
          >
            <Image
              source={{ uri: `data:image/png;base64,${value}` }}
              style={styles.thumb}
            />
          </TouchableOpacity>
          <Text style={styles.label}>{label}</Text>
          {!readOnly ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={handleSign}
                activeOpacity={0.85}
                style={[styles.actionBtn, styles.replaceBtn]}
                disabled={busy}
              >
                <MaterialIcons name="edit" size={14} color="#fff" />
                <Text style={styles.replaceBtnText}>Re-sign</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChange(role, null)}
                activeOpacity={0.85}
                style={[styles.actionBtn, styles.removeBtn]}
                disabled={busy}
              >
                <MaterialIcons name="delete-outline" size={14} color="#DC2626" />
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {padModal}
        {viewerModal}
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        onPress={handleSign}
        activeOpacity={readOnly ? 1 : 0.85}
        style={[styles.card, styles.cardEmpty, readOnly && { opacity: 0.6 }]}
        disabled={readOnly}
      >
        <View style={styles.uploadIconBox}>
          <MaterialIcons name="draw" size={28} color={NAVY} />
        </View>
        <Text style={styles.uploadLabel}>{label}</Text>
        <Text style={styles.uploadHint}>
          {readOnly ? 'Not signed' : 'Tap to sign'}
        </Text>
      </TouchableOpacity>
      {padModal}
    </>
  );
};

const SignatureCards = ({ owner, customer, onChange, readOnly = false, busy = false }) => {
  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <SignatureCard
          role="customer"
          label="CUSTOMER SIGNATURE"
          value={customer}
          onChange={onChange}
          readOnly={readOnly}
          busy={busy}
        />
      </View>
      <View style={styles.col}>
        <SignatureCard
          role="owner"
          label="CASHIER SIGNATURE"
          value={owner}
          onChange={onChange}
          readOnly={readOnly}
          busy={busy}
        />
      </View>
    </View>
  );
};

export default SignatureCards;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  cardEmpty: {
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: NAVY,
    borderStyle: 'dashed',
    paddingVertical: 22,
  },
  thumb: {
    width: '100%',
    height: 100,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    resizeMode: 'contain',
  },
  label: {
    fontSize: 10,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginTop: 8,
    textAlign: 'center',
  },
  uploadIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadLabel: {
    fontSize: 11,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.5,
    marginTop: 12,
    textAlign: 'center',
  },
  uploadHint: {
    fontSize: 10,
    color: MUTED,
    marginTop: 4,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  replaceBtn: { backgroundColor: ORANGE },
  replaceBtnText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  removeBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  removeBtnText: {
    color: '#DC2626',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  viewerBg: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImg: {
    width: '100%',
    height: '70%',
    resizeMode: 'contain',
  },
  viewerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerLabel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 28,
    left: 18,
    color: '#111',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
});
