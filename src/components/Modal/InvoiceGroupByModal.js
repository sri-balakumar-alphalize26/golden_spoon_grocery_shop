// InvoiceGroupByModal.js
//
// Group-By popup for InvoicesListScreen. Mirrors the Group By column from
// Odoo's Accounting → Invoices view. Single-select radio rows. Grouping
// is applied client-side by the list screen (rows reshaped into
// SectionList sections keyed by the chosen field).
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Modal, ScrollView, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

const OPTIONS = [
  { key: 'salesperson',    label: 'Salesperson'    },
  { key: 'partner',        label: 'Partner'        },
  { key: 'status',         label: 'Status'         },
  { key: 'payment_method', label: 'Payment Method' },
  { key: 'journal',        label: 'Journal'        },
];

const InvoiceGroupByModal = ({ isVisible, initialKey = null, onClose, onApply }) => {
  const [picked, setPicked] = useState(initialKey);

  useEffect(() => {
    if (isVisible) setPicked(initialKey);
  }, [isVisible, initialKey]);

  return (
    <Modal visible={isVisible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={s.card}>
              <View style={s.head}>
                <MaterialIcons name="layers" size={20} color="#1E88E5" />
                <Text style={s.title}>Group By</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialIcons name="close" size={20} color="#111827" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {OPTIONS.map((opt) => {
                  const on = picked === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={s.row}
                      activeOpacity={0.7}
                      onPress={() => setPicked(on ? null : opt.key)}
                    >
                      <MaterialIcons name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={on ? '#1E88E5' : '#9ca3af'} />
                      <Text style={s.rowLabel}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={s.footer}>
                <TouchableOpacity style={s.clearBtn} activeOpacity={0.7} onPress={() => setPicked(null)}>
                  <Text style={s.clearBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.applyBtn} activeOpacity={0.85} onPress={() => onApply && onApply(picked)}>
                  <Text style={s.applyBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default InvoiceGroupByModal;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 18 },
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f2f6' },
  title: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827', marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowLabel: { marginLeft: 10, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f2f6', marginTop: 6 },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  clearBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#6b7280' },
  applyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: COLORS.primaryThemeColor },
  applyBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
});
