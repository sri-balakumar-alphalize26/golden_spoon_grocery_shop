import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const Scanner = ({ navigation, route }) => {
  const onScanCallback = route?.params?.onScan;

  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await BarCodeScanner.requestPermissionsAsync();
        setHasPermission(status === 'granted');
      } catch (e) {
        setHasPermission(false);
      }
    })();
  }, []);

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || busy || !data) return;
    setScanned(true);
    if (typeof onScanCallback === 'function') {
      setBusy(true);
      try {
        await onScanCallback(data);
      } finally {
        setBusy(false);
      }
      return;
    }
    // No callback was passed — just bounce back with the scanned value on
    // route params so the previous screen can read it (rare path).
    navigation.goBack();
  };

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="no-photography" size={48} color="#9CA3AF" />
        <Text style={styles.permissionText}>Camera permission not granted</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <BarCodeScanner
        style={StyleSheet.absoluteFillObject}
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.iconBtn}
        >
          <MaterialIcons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Barcode</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Aiming frame */}
      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Point camera at the barcode</Text>
      </View>

      {/* Busy / scanned state */}
      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : null}

      {scanned && !busy ? (
        <TouchableOpacity
          style={styles.scanAgainBtn}
          activeOpacity={0.85}
          onPress={() => setScanned(false)}
        >
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default Scanner;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'center',
  },

  topBar: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  frameWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 260,
    height: 260,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#F47B20',
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 13,
    marginTop: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scanAgainBtn: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: '#F47B20',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    ...Platform.select({
      ios: { shadowColor: '#F47B20', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
    }),
  },
  scanAgainText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  cancelBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cancelText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});
