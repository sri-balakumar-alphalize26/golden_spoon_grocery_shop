// Two side-by-side image cards (Front + Back) for capturing a customer's
// ID proof. Mirrors the pattern used in alphalize_tools_management's
// rental flow: empty card shows a dashed Upload button + action sheet
// (Camera / Gallery), filled card shows a thumbnail with Replace and
// Remove buttons.
//
// Props:
//   front, back        — base64 strings (without `data:` prefix) or null
//   onChange(side, b64) — fires for each side when the user picks/clears
//                         a photo; pass `null` to clear. The parent
//                         decides when to commit the changes back to
//                         Odoo (typically on Save).
//   readOnly           — disables the upload/remove actions; cards still
//                         render the existing photos. Used by the POS
//                         quick-view modal.
//
// The component does not call the API itself — it just hands base64 up.
// Saving lives at the call site (CustomerFormTabs save handler, or the
// POS chip-modal's Save button).
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
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import InAppCameraModal from './InAppCameraModal';
import IdProofSourcePopup from './IdProofSourcePopup';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

const IdProofCard = ({ side, label, value, onChange, readOnly, busy }) => {
  const filled = !!value;
  // Fullscreen image viewer — tapping a filled thumbnail opens this so
  // the cashier can read the ID details (small thumbnail isn't enough
  // to verify a number/expiry).
  const [viewerVisible, setViewerVisible] = useState(false);
  // Source picker popup (Camera / Gallery / Cancel) — styled like
  // LogoutModal instead of the OS action sheet.
  const [pickerVisible, setPickerVisible] = useState(false);
  // Inline expo-camera modal — used by the Camera button so the user
  // never sees the OS camera's OK/Cancel review screen. Tap the
  // shutter once → photo returns straight to the edit form.
  const [cameraVisible, setCameraVisible] = useState(false);

  // Gallery uses ImagePicker. Disk-roundtrip read avoids the bridge
  // spike (no `base64: true` in the picker options).
  const pickFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
        exif: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Toast.show({ type: 'error', text1: 'Pick failed', text2: 'No image data', position: 'bottom' });
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      onChange(side, base64);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Pick failed', text2: e?.message || '', position: 'bottom' });
    }
  };

  const handleAdd = () => {
    if (readOnly) return;
    setPickerVisible(true);
  };

  // InAppCameraModal callback — user tapped the shutter, photo bytes
  // returned as base64. Dismiss the camera and write straight to the
  // form, no OS OK/Cancel review screen in between.
  const handleCameraCapture = (base64) => {
    setCameraVisible(false);
    if (base64) onChange(side, base64);
  };

  // Source picker — Camera / Gallery / Cancel, slide-up popup styled
  // like LogoutModal. Mounted in both branches below so it's reachable
  // from the empty card AND the Replace button.
  const sourcePopup = (
    <IdProofSourcePopup
      visible={pickerVisible}
      title={label}
      onCamera={() => {
        setPickerVisible(false);
        // Tiny delay so the popup's slide-down doesn't fight the
        // camera modal's slide-up animation.
        setTimeout(() => setCameraVisible(true), 120);
      }}
      onGallery={() => {
        setPickerVisible(false);
        setTimeout(() => pickFromGallery(), 120);
      }}
      onClose={() => setPickerVisible(false)}
    />
  );

  // Inline camera — uses expo-camera takePictureAsync, no OS
  // OK/Cancel review screen. Single shutter tap returns to the edit
  // form with the captured photo. Mirrors employee_attendance.
  const cameraModal = (
    <InAppCameraModal
      visible={cameraVisible}
      onCapture={handleCameraCapture}
      onClose={() => setCameraVisible(false)}
    />
  );

  // Fullscreen image viewer — opens when the cashier taps the
  // thumbnail. Black background, single tap-to-close gesture, image
  // sized to fit (resizeMode contain) so nothing is cropped.
  const viewerModal = filled ? (
    <Modal
      visible={viewerVisible}
      animationType="fade"
      transparent
      onRequestClose={() => setViewerVisible(false)}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <TouchableOpacity
        style={styles.viewerBg}
        activeOpacity={1}
        onPress={() => setViewerVisible(false)}
      >
        <Image
          source={{ uri: `data:image/jpeg;base64,${value}` }}
          style={styles.viewerImg}
        />
        <TouchableOpacity
          style={styles.viewerClose}
          onPress={() => setViewerVisible(false)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialIcons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.viewerLabel}>{label}</Text>
      </TouchableOpacity>
    </Modal>
  ) : null;

  if (filled) {
    return (
      <>
        <View style={styles.card}>
          {/* Tap thumbnail → fullscreen viewer. Replace / Remove
              actions stay on the buttons below so the viewer doesn't
              fight the action row. */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setViewerVisible(true)}
            style={{ alignSelf: 'stretch' }}
          >
            <Image
              source={{ uri: `data:image/jpeg;base64,${value}` }}
              style={styles.thumb}
            />
          </TouchableOpacity>
          <Text style={styles.label}>{label}</Text>
          {!readOnly ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={handleAdd}
                activeOpacity={0.85}
                style={[styles.actionBtn, styles.replaceBtn]}
                disabled={busy}
              >
                <MaterialIcons name="cached" size={14} color="#fff" />
                <Text style={styles.replaceBtnText}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChange(side, null)}
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
        {sourcePopup}
        {cameraModal}
        {viewerModal}
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        onPress={handleAdd}
        activeOpacity={readOnly ? 1 : 0.85}
        style={[styles.card, styles.cardEmpty, readOnly && { opacity: 0.6 }]}
        disabled={readOnly}
      >
        <View style={styles.uploadIconBox}>
          <MaterialIcons name="add-a-photo" size={28} color={NAVY} />
        </View>
        <Text style={styles.uploadLabel}>{label}</Text>
        {!readOnly ? (
          <Text style={styles.uploadHint}>Tap to capture / pick</Text>
        ) : (
          <Text style={styles.uploadHint}>Not uploaded</Text>
        )}
      </TouchableOpacity>
      {sourcePopup}
      {cameraModal}
    </>
  );
};

const IdProofCards = ({ front, back, onChange, readOnly = false, busy = false }) => {
  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <IdProofCard
          side="front"
          label="ID PROOF — FRONT"
          value={front}
          onChange={onChange}
          readOnly={readOnly}
          busy={busy}
        />
      </View>
      <View style={styles.col}>
        <IdProofCard
          side="back"
          label="ID PROOF — BACK"
          value={back}
          onChange={onChange}
          readOnly={readOnly}
          busy={busy}
        />
      </View>
    </View>
  );
};

export default IdProofCards;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: { flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    minHeight: 180,
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
    height: 120,
    borderRadius: 10,
    backgroundColor: '#000',
    resizeMode: 'cover',
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
  replaceBtn: {
    backgroundColor: ORANGE,
  },
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
  // Fullscreen image viewer — opened by tapping a filled thumbnail.
  viewerBg: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  viewerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerLabel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 28,
    left: 18,
    color: '#fff',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
});
