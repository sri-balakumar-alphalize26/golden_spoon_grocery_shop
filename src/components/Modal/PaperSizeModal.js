// PaperSizeModal — centered popup that lets the cashier pick a thermal
// receipt width before Preview / Download / Print fires. The picked
// width is passed back to the parent via onSelect(widthMm), then the
// parent invokes the chosen action with that width applied to the
// generated invoice HTML.
import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const SIZES = [
  { inch: '2 inch',   mm: 50,  sub: '50 mm' },
  { inch: '3 inch',   mm: 76,  sub: '76 mm' },
  { inch: '3.5 inch', mm: 80,  sub: '80 mm', isDefault: true },
  { inch: '4 inch',   mm: 100, sub: '100 mm' },
  { inch: 'A5',       mm: 148, sub: '148 × 210 mm' },
  { inch: 'A4',       mm: 210, sub: '210 × 297 mm' },
];

const PaperSizeModal = ({ isVisible, onSelect, onCancel }) => {
  return (
    <Modal
      visible={!!isVisible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.root}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <View style={s.iconWrap}>
              <MaterialIcons name="receipt-long" size={20} color="#9333ea" />
            </View>
            <Text style={s.title}>Choose receipt size</Text>
            <TouchableOpacity
              onPress={onCancel}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          </View>

          <Text style={s.help}>
            Pick a paper size. The receipt re-flows to fit the chosen size.
          </Text>

          {SIZES.map((sz) => (
            <TouchableOpacity
              key={sz.mm}
              style={[s.row, sz.isDefault && s.rowDefault]}
              onPress={() => onSelect && onSelect(sz.mm)}
              activeOpacity={0.85}
            >
              <View style={[s.rowDot, sz.isDefault && s.rowDotActive]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, sz.isDefault && s.rowLabelActive]}>{sz.inch}</Text>
                <Text style={s.rowSub}>{sz.sub}</Text>
              </View>
              {sz.isDefault ? (
                <View style={s.defaultBadge}>
                  <Text style={s.defaultBadgeText}>Default</Text>
                </View>
              ) : null}
              <MaterialIcons name="chevron-right" size={20} color="#9333ea" />
            </TouchableOpacity>
          ))}

          <View style={s.footer}>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.85}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default PaperSizeModal;

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#9333ea',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f3e8ff',
  },
  title: { flex: 1, fontSize: 16, color: '#581c87', fontWeight: '700' },
  help: {
    fontSize: 12, color: '#64748b', marginTop: 2, marginBottom: 12, lineHeight: 17,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  rowDefault: {
    backgroundColor: '#faf5ff',
    borderColor: '#c4b5fd',
  },
  rowDot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: '#cbd5e1',
  },
  rowDotActive: {
    backgroundColor: '#9333ea',
    borderColor: '#9333ea',
  },
  rowLabel: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  rowLabelActive: { color: '#581c87' },
  rowSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  defaultBadge: {
    backgroundColor: '#9333ea',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8,
  },
  defaultBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700', letterSpacing: 0.3 },
  footer: { marginTop: 8 },
  cancelBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#9333ea',
  },
  cancelBtnText: { color: '#9333ea', fontWeight: '700' },
});
