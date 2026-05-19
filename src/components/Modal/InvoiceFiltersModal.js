// InvoiceFiltersModal.js
//
// Filter dropdown for InvoicesListScreen. Mirrors the dropdown+checkboxes
// pattern from SalesReport (backdrop + centred card + scrollable list of
// rows with check-box / check-box-outline-blank). Selected filters are
// returned via onApply as a single shape the list can pass straight into
// fetchCustomerInvoicesOdoo:
//   { states[], moveTypes[], paymentStates[], overdueOnly }
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Modal, ScrollView, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

// Each option maps to one or more axes of the fetch payload. `kind`
// distinguishes which axis the option targets; the parent renders one
// section per kind label.
const OPTIONS = [
  // Status (multi-select)
  { key: 'state:draft',       label: 'Draft',         kind: 'state', value: 'draft' },
  { key: 'state:posted',      label: 'Posted',        kind: 'state', value: 'posted' },
  { key: 'state:cancel',      label: 'Cancelled',     kind: 'state', value: 'cancel' },
  // Payment state (multi-select)
  { key: 'pay:not_paid',      label: 'To Pay',        kind: 'pay',   value: 'not_paid' },
  { key: 'pay:in_payment',    label: 'In Payment',    kind: 'pay',   value: 'in_payment' },
  { key: 'pay:partial',       label: 'Partial',       kind: 'pay',   value: 'partial' },
  { key: 'pay:paid',          label: 'Paid',          kind: 'pay',   value: 'paid' },
  // Move type (multi-select)
  { key: 'type:invoices',     label: 'Invoices',      kind: 'type',  value: 'out_invoice' },
  { key: 'type:credit_notes', label: 'Credit Notes',  kind: 'type',  value: 'out_refund' },
  // Overdue toggle (single)
  { key: 'overdue',           label: 'Overdue',       kind: 'overdue' },
];

const SECTIONS = [
  { title: 'Status',         kinds: ['state'] },
  { title: 'Payment Status', kinds: ['pay'] },
  { title: 'Type',           kinds: ['type'] },
  { title: 'Other',          kinds: ['overdue'] },
];

const InvoiceFiltersModal = ({ isVisible, initialSelected = [], onClose, onApply }) => {
  const [selected, setSelected] = useState(new Set(initialSelected));

  useEffect(() => {
    if (isVisible) setSelected(new Set(initialSelected));
  }, [isVisible, initialSelected]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    const states = [];
    const paymentStates = [];
    const moveTypes = [];
    let overdueOnly = false;
    for (const opt of OPTIONS) {
      if (!selected.has(opt.key)) continue;
      if (opt.kind === 'state')   states.push(opt.value);
      if (opt.kind === 'pay')     paymentStates.push(opt.value);
      if (opt.kind === 'type')    moveTypes.push(opt.value);
      if (opt.kind === 'overdue') overdueOnly = true;
    }
    onApply && onApply({
      states, paymentStates, moveTypes, overdueOnly,
      keys: Array.from(selected),
    });
  };

  const clear = () => setSelected(new Set());

  return (
    <Modal visible={isVisible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={s.card}>
              <View style={s.head}>
                <Text style={s.title}>Filters</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialIcons name="close" size={20} color="#111827" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
                {SECTIONS.map((sec) => (
                  <View key={sec.title} style={s.section}>
                    <Text style={s.sectionTitle}>{sec.title}</Text>
                    {OPTIONS.filter((o) => sec.kinds.includes(o.kind)).map((opt) => {
                      const on = selected.has(opt.key);
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={s.row}
                          activeOpacity={0.7}
                          onPress={() => toggle(opt.key)}
                        >
                          <MaterialIcons
                            name={on ? 'check-box' : 'check-box-outline-blank'}
                            size={20}
                            color={on ? '#1E88E5' : '#9ca3af'}
                          />
                          <Text style={s.rowLabel}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
              <View style={s.footer}>
                <TouchableOpacity style={s.clearBtn} activeOpacity={0.7} onPress={clear}>
                  <Text style={s.clearBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.applyBtn} activeOpacity={0.85} onPress={apply}>
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

export default InvoiceFiltersModal;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 18 },
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 2, borderColor: '#1E88E5' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  title: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  section: { paddingTop: 8 },
  sectionTitle: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#1E88E5', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowLabel: { marginLeft: 10, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f2f6', marginTop: 8 },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  clearBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#6b7280' },
  applyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: COLORS.primaryThemeColor },
  applyBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
});
