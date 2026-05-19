// JournalsTilePopup.js
//
// Shown when the user taps the Journal Entries tile under Accounting on
// the Home screen. Outer popup card has a blue border to set it apart
// from the other modals; inside is a 2x2 grid of journal-type tiles
// (Sales / Purchases / Bank & Cash / Miscellaneous). Tapping a tile
// closes the popup and navigates to JournalEntriesListScreen with the
// matching `journalTypes` filter applied.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import Modal from 'react-native-modal';
import Text from '@components/Text';

const BLUE = '#1E88E5';

const SUB_TILES = [
  { label: 'Sales',          icon: 'point-of-sale',          journalTypes: ['sale'] },
  { label: 'Purchases',      icon: 'shopping-cart',          journalTypes: ['purchase'] },
  { label: 'Bank & Cash',    icon: 'account-balance-wallet', journalTypes: ['bank', 'cash'] },
  { label: 'Miscellaneous',  icon: 'receipt-long',           journalTypes: ['general'] },
];

const JournalsTilePopup = ({ isVisible, onClose, onPick }) => {
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
          {SUB_TILES.map((t) => (
            <TouchableOpacity
              key={t.label}
              style={styles.tile}
              activeOpacity={0.85}
              onPress={() => onPick && onPick({ journalTypes: t.journalTypes, titleSuffix: t.label })}
            >
              <MaterialIcons name={t.icon} size={28} color={BLUE} />
              <Text style={styles.tileLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
};

export default JournalsTilePopup;

const styles = StyleSheet.create({
  // Outer card — blue 2px border, white background.
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderColor: BLUE,
    borderWidth: 2,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginBottom: 14,
    color: '#111827',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  // Each tile — light bg + thin border + icon-above-label layout.
  tile: {
    width: '47%',
    aspectRatio: 1.3,
    backgroundColor: '#F5F8FE',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginVertical: 6,
  },
  tileLabel: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#1f2937',
    textAlign: 'center',
  },
});
