// PartnerLedgerFiltersModal.js
//
// Multi-select Filters popup for PartnerLedgerScreen, mirroring Odoo's Partner
// Ledger filter column: Posting Status, To Review, Reconciliation, Journal,
// Accounts, plus expandable Date / Invoice Date with month / quarter / year
// sub-options (of the current year, like Odoo).
//
// onApply returns a flat filters object the screen passes to the ledger fetch:
//   { posting[], toReview, reconcile[], journalTypes[], accountGroups[],
//     datePeriods:{date, invoice_date}, dateRanges:[{field,start,end}] }
import React, { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity, Modal, ScrollView, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';

// axis → the key in the emitted filters object; each option is [key, label].
const SECTIONS = [
  { title: 'Posting Status', axis: 'posting', options: [['draft', 'Unposted'], ['posted', 'Posted']] },
  { title: 'To Review', axis: 'flag', options: [['to_review', 'To Review']] },
  { title: 'Reconciliation', axis: 'reconcile', options: [['unreconciled', 'Unreconciled'], ['with_residual', 'With residual']] },
  { title: 'Journal', axis: 'journal', options: [['sale', 'Sales'], ['purchase', 'Purchases'], ['bank', 'Bank'], ['cash', 'Cash'], ['credit', 'Credit'], ['general', 'Miscellaneous']] },
  { title: 'Accounts', axis: 'account', options: [['payable', 'Payable'], ['receivable', 'Receivable'], ['pl', 'P&L Accounts']] },
];

// Date parents map to a move-line date field; each expands to period options.
const DATE_PARENTS = [
  { key: 'date', label: 'Date', field: 'date' },
  { key: 'invoice_date', label: 'Invoice Date', field: 'move_id.invoice_date' },
];

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();

// Quarters of the current year, Q4→Q1 (like Odoo's date filter).
const buildQuarters = () => {
  const Y = new Date().getFullYear();
  const out = [];
  for (let q = 4; q >= 1; q--) {
    const sm = (q - 1) * 3;
    out.push({ key: `q:${Y}-${q}`, label: `Q${q}`, start: `${Y}-${pad(sm + 1)}-01`, end: `${Y}-${pad(sm + 3)}-${pad(lastDay(Y, sm + 2))}` });
  }
  return out;
};

const filtersToKeys = (f = {}) => {
  const s = new Set();
  (f.posting || []).forEach((k) => s.add(`posting:${k}`));
  if (f.toReview) s.add('flag:to_review');
  (f.reconcile || []).forEach((k) => s.add(`reconcile:${k}`));
  (f.journalTypes || []).forEach((k) => s.add(`journal:${k}`));
  (f.accountGroups || []).forEach((k) => s.add(`account:${k}`));
  const dp = f.datePeriods || {};
  DATE_PARENTS.forEach((p) => { if (dp[p.key]) s.add(`${p.key}:${dp[p.key]}`); });
  return s;
};

const PartnerLedgerFiltersModal = ({ isVisible, initialFilters = {}, periods = { months: [], years: [] }, onClose, onApply }) => {
  // Only the used months (from data) + quarters + used years, like Odoo.
  const PERIODS = useMemo(
    () => [...(periods.months || []), ...buildQuarters(), ...(periods.years || [])],
    [periods]
  );
  const [selected, setSelected] = useState(() => filtersToKeys(initialFilters));
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (isVisible) setSelected(filtersToKeys(initialFilters));
  }, [isVisible, initialFilters]);

  const toggle = (full) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(full)) next.delete(full);
      else next.add(full);
      return next;
    });
  };

  // Period sub-options are mutually exclusive within a date parent (radio).
  const setPeriod = (parentKey, periodKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      PERIODS.forEach((p) => next.delete(`${parentKey}:${p.key}`));
      const full = `${parentKey}:${periodKey}`;
      if (!prev.has(full)) next.add(full);
      return next;
    });
  };

  const apply = () => {
    const out = {
      posting: [], toReview: false, reconcile: [], journalTypes: [], accountGroups: [],
      datePeriods: {}, dateRanges: [],
    };
    for (const key of selected) {
      const [axis, val] = key.split(':');
      if (axis === 'posting') out.posting.push(val);
      else if (axis === 'flag' && val === 'to_review') out.toReview = true;
      else if (axis === 'reconcile') out.reconcile.push(val);
      else if (axis === 'journal') out.journalTypes.push(val);
      else if (axis === 'account') out.accountGroups.push(val);
    }
    for (const parent of DATE_PARENTS) {
      const p = PERIODS.find((per) => selected.has(`${parent.key}:${per.key}`));
      if (p) {
        out.datePeriods[parent.key] = p.key;
        out.dateRanges.push({ field: parent.field, start: p.start, end: p.end, label: `${parent.label}: ${p.label}`, pkey: parent.key });
      }
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

              <ScrollView style={s.scroll} showsVerticalScrollIndicator>
                {SECTIONS.map((sec) => (
                  <View key={sec.axis}>
                    <Text style={s.sectionTitle}>{sec.title}</Text>
                    {sec.options.map(([key, label]) => {
                      const full = `${sec.axis}:${key}`;
                      const on = selected.has(full);
                      return (
                        <TouchableOpacity key={full} style={s.row} activeOpacity={0.7} onPress={() => toggle(full)}>
                          <MaterialIcons name={on ? 'check-box' : 'check-box-outline-blank'} size={20} color={on ? '#1E88E5' : '#9ca3af'} />
                          <Text style={s.rowLabel}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                <Text style={s.sectionTitle}>Date</Text>
                {DATE_PARENTS.map((parent) => {
                  const isOpen = !!expanded[parent.key];
                  const activePeriod = PERIODS.find((p) => selected.has(`${parent.key}:${p.key}`));
                  return (
                    <View key={parent.key}>
                      <TouchableOpacity
                        style={s.parentRow}
                        activeOpacity={0.7}
                        onPress={() => setExpanded((e) => ({ ...e, [parent.key]: !e[parent.key] }))}
                      >
                        <Text style={s.parentLabel}>{parent.label}</Text>
                        {activePeriod ? <Text style={s.parentBadge}>{activePeriod.label}</Text> : null}
                        <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={20} color="#6b7280" />
                      </TouchableOpacity>
                      {isOpen ? (
                        <View style={s.parentChildren}>
                          {PERIODS.map((p) => {
                            const full = `${parent.key}:${p.key}`;
                            const on = selected.has(full);
                            return (
                              <TouchableOpacity key={full} style={s.childRow} activeOpacity={0.7} onPress={() => setPeriod(parent.key, p.key)}>
                                <MaterialIcons name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={18} color={on ? '#1E88E5' : '#9ca3af'} />
                                <Text style={s.childLabel}>{p.label}</Text>
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

export default PartnerLedgerFiltersModal;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 18 },
  // Cap the card to the viewport so the footer stays visible and the list
  // scrolls internally (fixes filters below "Cash" being unreachable).
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, maxHeight: '82%' },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f2f6' },
  title: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827', marginLeft: 6 },
  scroll: { flexShrink: 1 },
  sectionTitle: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowLabel: { marginLeft: 10, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium },
  parentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
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
