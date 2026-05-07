// Inline-camera modal for ID-proof capture.
//
// Why not `ImagePicker.launchCameraAsync`?
// On Android the system camera intent rebuilds a full-resolution bitmap
// when the user taps OK and ships it across the React Native bridge.
// On mid-range devices that's enough to OOM the bridge and the OS
// kills the app — exactly the bug the user reported. The
// employee_attendance project (VehicleTrackingForm.js / VisitForm.js)
// solved this by hosting `expo-camera`'s `<Camera>` component inline
// and capturing via `takePictureAsync`, bypassing the OS OK/Cancel UI
// entirely. We mirror that pattern here.
//
// Props:
//   visible      — bool, controls Modal visibility
//   onCapture    — fn(base64) called with the captured base64 string
//   onClose      — fn() called when the user cancels (no capture)
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;

const InAppCameraModal = ({ visible, onCapture, onClose }) => {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = Camera.useCameraPermissions();
  const [type, setType] = useState(CameraType.back);
  const [busy, setBusy] = useState(false);

  // Ensure permissions are requested the first time the modal opens.
  useEffect(() => {
    if (visible && permission && !permission.granted) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleCapture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      // employee_attendance pattern: quality 0.7 for ID-proof legibility,
      // base64 for the upload payload, no exif (PII reduction).
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        exif: false,
        skipProcessing: true,
      });
      // Critical 100ms yield — gives the native camera view time to
      // tear down before the parent state updates trigger renders.
      // Without this, RN's bridge can OOM on the same frame.
      setTimeout(() => {
        onCapture && onCapture(photo?.base64 || null);
        setBusy(false);
      }, 100);
    } catch (e) {
      setBusy(false);
      onClose && onClose();
    }
  };

  const handleClose = () => {
    if (busy) return;
    onClose && onClose();
  };

  const flipCamera = () => {
    setType((prev) => (prev === CameraType.back ? CameraType.front : CameraType.back));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        {!permission || !permission.granted ? (
          <View style={styles.permissionBox}>
            <MaterialIcons name="photo-camera" size={56} color="#fff" />
            <Text style={styles.permissionTitle}>Camera permission needed</Text>
            <Text style={styles.permissionHint}>
              Allow Grocery Shop to use your camera so you can capture ID proofs.
            </Text>
            <TouchableOpacity style={styles.allowBtn} onPress={requestPermission} activeOpacity={0.85}>
              <Text style={styles.allowBtnText}>Allow Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.85}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Camera ref={cameraRef} style={StyleSheet.absoluteFill} type={type} />
            {/* Top bar — close + flip */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleClose} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialIcons name="close" size={26} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={flipCamera} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialIcons name="flip-camera-android" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
            {/* Bottom bar — shutter */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                onPress={handleCapture}
                style={styles.shutter}
                activeOpacity={0.85}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={NAVY} size="large" />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

export default InAppCameraModal;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: NAVY,
  },
  permissionBox: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginTop: 14,
    textAlign: 'center',
  },
  permissionHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 18,
  },
  allowBtn: {
    backgroundColor: '#F47B20',
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 999,
    minWidth: 200,
    alignItems: 'center',
  },
  allowBtnText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, letterSpacing: 0.4 },
  cancelBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.7)', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 13 },
});
