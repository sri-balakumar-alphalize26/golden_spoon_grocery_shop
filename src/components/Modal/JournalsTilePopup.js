// JournalsTilePopup.js
//
// Shown when the user taps the Journal Entries tile under Accounting on
// the Home screen. Lists the four journal types as horizontal home-style
// tiles (accent bar on the left + icon disk + label) — matches the look
// of the Home screen card grid for visual consistency.
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import Modal from 'react-native-modal';
import Text from '@components/Text';
import { useAuthStore } from '@stores/auth';

const SUB_TILES = [
  { label: 'Sales',          icon: 'point-of-sale',          bg: '#E7F1FD', accent: '#1E88E5', journalTypes: ['sale'],            featureKey: 'accounting.journals.sales' },
  { label: 'Purchases',      icon: 'shopping-cart',          bg: '#FFF3E0', accent: '#FF9800', journalTypes: ['purchase'],        featureKey: 'accounting.journals.purchases' },
  { label: 'Bank & Cash',    icon: 'account-balance-wallet', bg: '#DCFCE7', accent: '#16A34A', journalTypes: ['bank', 'cash'],    featureKey: 'accounting.journals.bank_cash' },
  { label: 'Miscellaneous',  icon: 'receipt-long',           bg: '#F3E5F5', accent: '#7B2D8E', journalTypes: ['general'],         featureKey: 'accounting.journals.miscellaneous' },
];

const JournalsTilePopup = ({ isVisible, onClose, onPick }) => {
  // Filter the 4 sub-tiles by the per-tile feature gate. Admin can
  // hide e.g. "Purchases" for a user; that tile disappears from the
  // popup for that user.
  const hiddenFeatures = useAuthStore((s) => s.hiddenFeatures);
  const visibleTiles = SUB_TILES.filter((t) => !(hiddenFeatures && hiddenFeatures.has && hiddenFeatures.has(t.featureKey)));
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
        <Text style={styles.title}>Select Journal</Text>
        <View style={styles.grid}>
          {visibleTiles.map((t) => (
            <TouchableOpacity
              key={t.label}
              style={styles.tile}
              activeOpacity={0.85}
              onPress={() => onPick && onPick({ journalTypes: t.journalTypes, titleSuffix: t.label })}
            >
              {/* Accent bar on the left — matches HomeScreen card pattern */}
              <View style={[styles.accentBar, { backgroundColor: t.accent }]} />
              <View style={[styles.iconWrap, { backgroundColor: t.bg }]}>
                <MaterialIcons name={t.icon} size={22} color={t.accent} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={1}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
};

export default JournalsTilePopup;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginBottom: 12,
    color: '#111827',
    textAlign: 'center',
  },
  grid: { width: '100%' },
  // Horizontal home-tile layout: accent bar + icon disk + label.
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 0,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    marginLeft: 12,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#111827',
    flex: 1,
  },
});
