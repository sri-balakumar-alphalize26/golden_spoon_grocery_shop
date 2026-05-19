// PayInvoiceModal.js
//
// Centered popup that mirrors Odoo's web Pay dialog for a customer invoice.
// Opened from InvoiceDetailScreen when the user taps the Pay button on a
// posted invoice with residual > 0.
//
// Layout matches Odoo's two-column grid:
//   Left column                  Right column
//   ------------------------     ------------------------
//   Journal (dropdown)           Amount + Currency
//   Payment Method (read-only)   Payment Date
//   Recipient Bank Account       Memo
//
// On Create Payment, the parent (InvoiceDetailScreen) calls
// registerPaymentForInvoiceOdoo with the user's chosen values.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Modal, ScrollView, StyleSheet, TextInput, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';
import { fetchAccountJournalsForPaymentOdoo } from '@api/services/generalApi';

const todayISO = () => new Date().toISOString().slice(0, 10);

const PayInvoiceModal = ({ isVisible, invoice, currency, onClose, onSubmit, submitting }) => {
  const residual = Number(invoice?.amount_residual || 0);
  const defaultMemo = invoice?.name || '';
  const [journals, setJournals] = useState([]);
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [journalId, setJournalId] = useState(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [memo, setMemo] = useState('');
  const [recipientBank, setRecipientBank] = useState('');

  useEffect(() => {
    if (!isVisible) return;
    setAmount(residual > 0 ? String(residual) : '');
    setPaymentDate(todayISO());
    setMemo(defaultMemo);
    setRecipientBank('');
    setJournalOpen(false);
    (async () => {
      setJournalsLoading(true);
      try {
        const resp = await fetchAccountJournalsForPaymentOdoo();
        if (resp && !resp.error) {
          const list = resp.result || [];
          setJournals(list);
          // Prefer a bank-type journal as the default (matches Odoo's
          // default choice on the customer-invoice Pay dialog).
          const bank = list.find((j) => j.type === 'bank') || list[0];
          if (bank) setJournalId(bank.id);
        }
      } finally {
        setJournalsLoading(false);
      }
    })();
  }, [isVisible, residual, defaultMemo]);

  const selectedJournal = journals.find((j) => j.id === journalId) || null;
  const currencySymbol = currency?.symbol || currency?.name || '';

  const handleSubmit = () => {
    if (!journalId) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    onSubmit && onSubmit({ journalId, amount: amt, paymentDate, memo, recipientBank });
  };

  return (
    <Modal visible={isVisible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={s.card}>
              <View style={s.head}>
                <Text style={s.title}>Pay</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialIcons name="close" size={20} color="#111827" />
                </TouchableOpacity>
              </View>

              <View style={s.warningBar}>
                <MaterialIcons name="warning-amber" size={16} color="#b91c1c" />
                <Text style={s.warningText}>
                  Make sure you don't pay twice. Check existing payments before confirming.
                </Text>
              </View>

              <ScrollView style={{ maxHeight: 440 }}>
                {/* Two-column grid (mirrors Odoo's customer-invoice Pay dialog).
                    On narrow phones the columns wrap thanks to flexWrap. */}
                <View style={s.grid}>
                  {/* Row 1 — Journal | Amount */}
                  <View style={s.col}>
                    <Text style={s.fieldLabel}>Journal</Text>
                    <TouchableOpacity
                      style={s.dropdown}
                      activeOpacity={0.8}
                      onPress={() => setJournalOpen((o) => !o)}
                      disabled={journalsLoading}
                    >
                      <Text style={s.dropdownText}>
                        {journalsLoading ? 'Loading…' : (selectedJournal ? selectedJournal.name : 'Select journal')}
                      </Text>
                      <MaterialIcons name={journalOpen ? 'expand-less' : 'expand-more'} size={20} color="#6b7280" />
                    </TouchableOpacity>
                    {journalOpen ? (
                      <View style={s.dropdownList}>
                        {journals.map((j) => (
                          <TouchableOpacity
                            key={j.id}
                            style={[s.dropdownItem, j.id === journalId && s.dropdownItemSelected]}
                            activeOpacity={0.7}
                            onPress={() => { setJournalId(j.id); setJournalOpen(false); }}
                          >
                            <Text style={[s.dropdownItemText, j.id === journalId && { color: '#1E88E5', fontFamily: FONT_FAMILY.urbanistBold }]}>
                              {j.name} <Text style={s.muted}>({j.type})</Text>
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={s.col}>
                    <Text style={s.fieldLabel}>Amount</Text>
                    <View style={s.amountRow}>
                      <TextInput
                        style={[s.input, { flex: 1 }]}
                        keyboardType="decimal-pad"
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.000"
                      />
                      <View style={s.currencyPill}>
                        <Text style={s.currencyPillText}>{currencySymbol || 'OMR'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Row 2 — Payment Method | Payment Date */}
                  <View style={s.col}>
                    <View style={s.labelRow}>
                      <Text style={s.fieldLabel}>Payment Method</Text>
                      <MaterialIcons name="help-outline" size={12} color="#9ca3af" />
                    </View>
                    <View style={[s.input, s.readOnly]}>
                      <Text style={s.dropdownText}>Manual Payment</Text>
                    </View>
                  </View>

                  <View style={s.col}>
                    <Text style={s.fieldLabel}>Payment Date</Text>
                    <View style={s.inputWithIcon}>
                      <TextInput
                        style={[s.input, { flex: 1, paddingRight: 32 }]}
                        value={paymentDate}
                        onChangeText={setPaymentDate}
                        placeholder="YYYY-MM-DD"
                      />
                      <MaterialIcons name="event" size={18} color="#9ca3af" style={s.inputIcon} />
                    </View>
                  </View>

                  {/* Row 3 — Recipient Bank Account | Memo */}
                  <View style={s.col}>
                    <Text style={s.fieldLabel}>Recipient Bank Account</Text>
                    <TextInput
                      style={s.input}
                      value={recipientBank}
                      onChangeText={setRecipientBank}
                      placeholder="—"
                    />
                  </View>

                  <View style={s.col}>
                    <Text style={s.fieldLabel}>Memo</Text>
                    <TextInput
                      style={s.input}
                      value={memo}
                      onChangeText={setMemo}
                      placeholder="Invoice number"
                    />
                  </View>
                </View>
              </ScrollView>

              <View style={s.footer}>
                <TouchableOpacity
                  style={[s.payBtn, (!journalId || submitting) && { opacity: 0.6 }]}
                  activeOpacity={0.85}
                  disabled={!journalId || submitting}
                  onPress={handleSubmit}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.payBtnText}>Create Payment</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.discardBtn} activeOpacity={0.7} onPress={onClose}>
                  <Text style={s.discardBtnText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default PayInvoiceModal;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 18 },
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f2f6' },
  title: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  warningBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCE7E7', borderRadius: 8, padding: 8, marginTop: 10, marginBottom: 4 },
  warningText: { flex: 1, fontSize: 12, color: '#b91c1c', fontFamily: FONT_FAMILY.urbanistMedium },
  // Two-column grid — wraps naturally on narrow widths.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 8 },
  col: { width: '48%', marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldLabel: { fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 4 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 },
  dropdownText: { fontSize: 13, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium },
  muted: { color: '#9ca3af', fontSize: 12 },
  dropdownList: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginTop: 4, maxHeight: 160 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f2f6' },
  dropdownItemSelected: { backgroundColor: '#E7F1FD' },
  dropdownItemText: { fontSize: 13, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, minHeight: 42 },
  readOnly: { backgroundColor: '#F5F6F8', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currencyPill: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#d1d5db' },
  currencyPillText: { fontSize: 12, color: '#374151', fontFamily: FONT_FAMILY.urbanistBold },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center' },
  inputIcon: { position: 'absolute', right: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  payBtn: { paddingVertical: 11, paddingHorizontal: 20, borderRadius: 8, backgroundColor: COLORS.primaryThemeColor, marginRight: 8 },
  payBtnText: { fontSize: 14, color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },
  discardBtn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
  discardBtnText: { fontSize: 14, color: '#374151', fontFamily: FONT_FAMILY.urbanistBold },
});
