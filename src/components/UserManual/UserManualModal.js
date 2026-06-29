// Choice popup for the User Manual — View / Download. Slide-up modal with
// two tappable option cards (icon + title + subtitle) and a Cancel button.
import React from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import RNModal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const OptionRow = ({ icon, iconColor, title, subtitle, onPress, disabled }) => (
  <TouchableOpacity style={styles.option} activeOpacity={0.85} onPress={onPress} disabled={disabled}>
    <View style={[styles.optionIcon, { backgroundColor: iconColor + '18' }]}>
      <MaterialIcons name={icon} size={22} color={iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionSub}>{subtitle}</Text>
    </View>
    <MaterialIcons name="chevron-right" size={22} color="#C4CAD4" />
  </TouchableOpacity>
);

const UserManualModal = ({ visible, onView, onDownload, onClose, busy = false }) => {
  return (
    <RNModal
      isVisible={visible}
      animationIn="zoomIn"
      animationOut="zoomOut"
      backdropOpacity={0.6}
      animationInTiming={250}
      animationOutTiming={220}
      onBackButtonPress={onClose}
      onBackdropPress={onClose}
      style={styles.modal}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <MaterialIcons name="menu-book" size={22} color={NAVY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>User Manual</Text>
            <Text style={styles.subtitle}>How would you like to use it?</Text>
          </View>
        </View>

        <OptionRow
          icon="visibility"
          iconColor={NAVY}
          title="View"
          subtitle="Open it in your PDF app"
          onPress={onView}
          disabled={busy}
        />
        <OptionRow
          icon="file-download"
          iconColor={ORANGE}
          title="Download"
          subtitle="Save a copy to your device"
          onPress={onDownload}
          disabled={busy}
        />

        <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.85} onPress={onClose} disabled={busy}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator size="small" color={NAVY} />
            <Text style={styles.busyText}>Preparing…</Text>
          </View>
        ) : null}
      </View>
    </RNModal>
  );
};

export default UserManualModal;

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', alignItems: 'center', margin: 0 },
  sheet: {
    width: '88%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: NAVY + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  subtitle: { fontSize: 12.5, color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F7F8FB',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontSize: 15, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  optionSub: { fontSize: 12, color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 1 },
  cancelBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E6EC',
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, color: '#6B7280', fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.3 },
  busyOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  busyText: { fontSize: 12, color: NAVY, fontFamily: FONT_FAMILY.urbanistMedium },
});
