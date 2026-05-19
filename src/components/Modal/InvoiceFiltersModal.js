// InvoiceFiltersModal.js
//
// Filters popup for InvoicesListScreen. Mirrors Odoo's Accounting →
// Invoices filter column: My Invoices, Status (Draft/Posted/Cancelled),
// Not Sent, Type (Invoices/Receipts/Credit Notes), To Review, Payment
// (To Pay/In Payment/Overdue), plus expandable Invoice Date / Due Date /
// Accounting Date with sub-options (Today / This Week / This Month /
// This Quarter / This Year).
//
// Selected keys are returned via onApply with a flat shape the list
// can pass to fetchCustomerInvoicesOdoo:
//   { keys[], states[], moveTypes[], paymentStates[], overdueOnly,
//     myOnly, notSent, toReview,
//     invoiceDateRange, dueDateRange, accountingDateRange }
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Modal, ScrollView, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

const DATE_OPTIONS = [
  { key: 'today',         label: 'Today' },
  { key: 'this_week',     label: 'This Week' },
  { key: 'this_month',    label: 'This Month' },
  { key: 'this_quarter',  label: 'This Quarter' },
  { key: 'this_year',     label: 'This Year' },
];

const SIMPLE_FILTERS = [
  { key: 'my_invoices',    label: 'My Invoices',   axis: 'myOnly' },
  { key: 'state:draft',    label: 'Draft',         axis: 'state',  value: 'draft' },
  { key: 'state:posted',   label: 'Posted',        axis: 'state',  value: 'posted' },
  { key: 'state:cancel',   label: 'Cancelled',     axis: 'state',  value: 'cancel' },
  { key: 'not_sent',       label: 'Not Sent',      axis: 'notSent' },
  { key: 'type:inv',       label: 'Invoices',      axis: 'type',   value: 'out_invoice' },
  { key: 'type:receipt',   label: 'Receipts',      axis: 'type',   value: 'out_receipt' },
  { key: 'type:credit',    label: 'Credit Notes',  axis: 'type',   value: 'out_refund' },
  { key: 'to_review',      label: 'To Review',     axis: 'toReview' },
  { key: 'pay:not_paid',   label: 'To Pay',        axis: 'pay',    value: 'not_paid' },
  { key: 'pay:in_payment', label: 'In Payment',    axis: 'pay',    value: 'in_payment' },
  { key: 'overdue',        label: 'Overdue',       axis: 'overdue' },
];

const DATE_PARENTS = [
  { key: 'invDate',  label: 'Invoice Date',    axis: 'invoiceDateRange' },
  { key: 'dueDate',  label: 'Due Date',        axis: 'dueDateRange' },
  { key: 'accDate',  label: 'Accounting Date', axis: 'accountingDateRange' },
];

const InvoiceFiltersModal = ({ isVisible, initialSelected = [], onClose, onApply }) => {
  const [selected, setSelected] = useState(new Set(initialSelected));
  const [expanded, setExpanded] = useState({}); // parentKey -> bool

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

  // Date sub-options are mutually exclusive within their parent — picking
  // "Today" under Invoice Date clears the other Invoice Date sub-options.
  const setDateSub = (parentKey, subKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      // Clear every existing sub-key for this parent.
      DATE_OPTIONS.forEach((opt) => next.delete(`${parentKey}:${opt.key}`));
      // Add the new one (or clear if user tapped the same option to deselect).
      const full = `${parentKey}:${subKey}`;
      if (!prev.has(full)) next.add(full);
      return next;
    });
  };

  const apply = () => {
    const out = {
      keys: Array.from(selected),
      states: [], moveTypes: [], paymentStates: [],
      overdueOnly: false, myOnly: false, notSent: false, toReview: false,
      invoiceDateRange: null, dueDateRange: null, accountingDateRange: null,
    };
    for (const opt of SIMPLE_FILTERS) {
      if (!selected.has(opt.key)) continue;
      if (opt.axis === 'state')    out.states.push(opt.value);
      if (opt.axis === 'type')     out.moveTypes.push(opt.value);
      if (opt.axis === 'pay')      out.paymentStates.push(opt.value);
      if (opt.axis === 'overdue')  out.overdueOnly = true;
      if (opt.axis === 'myOnly')   out.myOnly = true;
      if (opt.axis === 'notSent')  out.notSent = true;
      if (opt.axis === 'toReview') out.toReview = true;
    }
    for (const parent of DATE_PARENTS) {
      const found = DATE_OPTIONS.find((opt) => selected.has(`${parent.key}:${opt.key}`));
      if (found) out[parent.axis] = found.key;
    }
    onApply && onApply(out);
  };

  const clear = () => setSelected(new Set());

  return (
    <Modal visible={isVisible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={s.card}>
              <View style={s.head}>
                <MaterialIcons name="filter-list" size={20} color="#1E88E5" />
                <Text style={s.title}>Filters</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialIcons name="close" size={20} color="#111827" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                {SIMPLE_FILTERS.map((opt) => {
                  const on = selected.has(opt.key);
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={s.row}
                      activeOpacity={0.7}
                      onPress={() => toggle(opt.key)}
                    >
                      <MaterialIcons name={on ? 'check-box' : 'check-box-outline-blank'} size={20} color={on ? '#1E88E5' : '#9ca3af'} />
                      <Text style={s.rowLabel}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}

                {DATE_PARENTS.map((parent) => {
                  const isOpen = !!expanded[parent.key];
                  const activeSub = DATE_OPTIONS.find((opt) => selected.has(`${parent.key}:${opt.key}`));
                  return (
                    <View key={parent.key}>
                      <TouchableOpacity
                        style={s.parentRow}
                        activeOpacity={0.7}
                        onPress={() => setExpanded((e) => ({ ...e, [parent.key]: !e[parent.key] }))}
                      >
                        <Text style={s.parentLabel}>{parent.label}</Text>
                        {activeSub ? (
                          <Text style={s.parentBadge}>{activeSub.label}</Text>
                        ) : null}
                        <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={20} color="#6b7280" />
                      </TouchableOpacity>
                      {isOpen ? (
                        <View style={s.parentChildren}>
                          {DATE_OPTIONS.map((opt) => {
                            const full = `${parent.key}:${opt.key}`;
                            const on = selected.has(full);
                            return (
                              <TouchableOpacity
                                key={full}
                                style={s.childRow}
                                activeOpacity={0.7}
                                onPress={() => setDateSub(parent.key, opt.key)}
                              >
                                <MaterialIcons name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={18} color={on ? '#1E88E5' : '#9ca3af'} />
                                <Text style={s.childLabel}>{opt.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
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
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f2f6' },
  title: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827', marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowLabel: { marginLeft: 10, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium },
  parentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6', marginTop: 4 },
  parentLabel: { flex: 1, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistBold },
  parentBadge: { fontSize: 12, color: '#1E88E5', fontFamily: FONT_FAMILY.urbanistBold, marginRight: 8 },
  parentChildren: { paddingLeft: 12 },
  childRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  childLabel: { marginLeft: 8, fontSize: 13, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistMedium },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f2f6', marginTop: 6 },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  clearBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#6b7280' },
  applyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: COLORS.primaryThemeColor },
  applyBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' },
});
