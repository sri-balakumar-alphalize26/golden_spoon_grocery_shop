import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch, FlatList, Dimensions, Platform,
} from 'react-native';
import Modal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import {
  fetchPaymentMethods, createPaymentMethod, updatePaymentMethod,
  fetchAccountJournals,
} from '@api/services/easyPurchaseApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const PaymentMethodFormScreen = ({ navigation, route }) => {
  const id = route?.params?.id;
  const isEdit = !!id;

  const [bootstrapping, setBootstrapping] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('10');
  const [active, setActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [isVendorAccount, setIsVendorAccount] = useState(false);
  const [journal, setJournal] = useState(null);
  const [notes, setNotes] = useState('');

  const [journalOptions, setJournalOptions] = useState([]);
  const [journalPickerVisible, setJournalPickerVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const journals = await fetchAccountJournals();
        setJournalOptions((journals || []).map((j) => ({
          id: j.id, label: j.name, sub: j.type === 'cash' ? 'Cash' : 'Bank',
        })));

        if (isEdit) {
          const all = await fetchPaymentMethods({ active: false });
          const rec = (all || []).find((r) => r.id === id);
          if (rec) {
            setName(rec.name || '');
            setSequence(String(rec.sequence ?? 10));
            setActive(!!rec.active);
            setIsDefault(!!rec.is_default);
            setIsVendorAccount(!!rec.is_vendor_account);
            setNotes(rec.notes || '');
            if (rec.journal_id) setJournal({ id: rec.journal_id[0], label: rec.journal_id[1] });
          }
        }
      } catch (e) {
        console.error('[PaymentMethodForm] bootstrap', e);
        showToastMessage(e?.message || 'Failed to load form');
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [id]);

  const submit = async () => {
    if (!isVendorAccount && !name.trim()) return showToastMessage('Enter a payment method name');
    if (!isVendorAccount && !journal) return showToastMessage('Select a journal (or enable Vendor Account for credit)');

    setSubmitting(true);
    try {
      const vals = {
        name: name.trim() || (isVendorAccount ? 'Credit' : ''),
        sequence: parseInt(sequence, 10) || 10,
        active: !!active,
        is_default: !!isDefault,
        is_vendor_account: !!isVendorAccount,
        journal_id: isVendorAccount ? false : (journal?.id || false),
        notes: notes || false,
      };
      if (isEdit) {
        await updatePaymentMethod(id, vals);
        showToastMessage('Updated');
      } else {
        await createPaymentMethod(vals);
        showToastMessage('Created');
      }
      navigation.goBack();
    } catch (e) {
      console.error('[PaymentMethodForm] submit', e);
      showToastMessage(e?.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  if (bootstrapping) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title={isEdit ? 'Edit Payment Method' : 'New Payment Method'} onBackPress={() => navigation.goBack()} />
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title={isEdit ? 'Edit Payment Method' : 'New Payment Method'} onBackPress={() => navigation.goBack()} />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Basic Info</Text>

          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            placeholder={isVendorAccount ? 'Credit' : 'e.g. Cash, Bank Transfer'}
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Sequence</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={sequence}
            onChangeText={setSequence}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Type</Text>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Vendor Account (Credit Purchase)</Text>
              <Text style={styles.toggleHelp}>No payment is created. Bill stays unpaid in vendor payable account.</Text>
            </View>
            <Switch
              value={isVendorAccount}
              onValueChange={(v) => {
                setIsVendorAccount(v);
                if (v) { setJournal(null); if (!name) setName('Credit'); }
                else if (name === 'Credit') setName('');
              }}
              trackColor={{ true: ORANGE }}
            />
          </View>

          {!isVendorAccount ? (
            <>
              <Text style={styles.label}>Journal *</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setJournalPickerVisible(true)}>
                <Text style={styles.pickerValue}>{journal?.label || 'Select journal (cash or bank)'}</Text>
                <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status</Text>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Active</Text>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: ORANGE }} />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Default Payment Method</Text>
              <Text style={styles.toggleHelp}>Selected automatically on new Easy Purchase entries.</Text>
            </View>
            <Switch value={isDefault} onValueChange={setIsDefault} trackColor={{ true: ORANGE }} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Optional notes"
            placeholderTextColor="#999"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.btn, styles.btnConfirm, submitting && { opacity: 0.6 }]}
          disabled={submitting}
          onPress={submit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialIcons name="check" size={20} color="#fff" />
              <Text style={styles.btnConfirmText}>{isEdit ? 'Save Changes' : 'Create Method'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        isVisible={journalPickerVisible}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.4}
        animationInTiming={250}
        animationOutTiming={200}
        backdropTransitionInTiming={250}
        backdropTransitionOutTiming={200}
        onBackdropPress={() => setJournalPickerVisible(false)}
        onBackButtonPress={() => setJournalPickerVisible(false)}
        style={styles.modalCenter}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Journal</Text>
            <TouchableOpacity onPress={() => setJournalPickerVisible(false)} style={styles.modalCloseBtn}>
              <MaterialIcons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={journalOptions}
            keyExtractor={(it) => `j-${it.id}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => { setJournal(item); setJournalPickerVisible(false); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerLabel}>{item.label}</Text>
                  {item.sub ? <Text style={styles.pickerSub}>{item.sub}</Text> : null}
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.emptyPicker}>No cash or bank journals found</Text>}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY, marginBottom: 8 },
  label: { fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, backgroundColor: '#fff',
  },
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pickerValue: { flex: 1, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6', marginTop: 6,
  },
  toggleLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#374151' },
  toggleHelp: { fontSize: 11, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2 },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnConfirm: {
    backgroundColor: ORANGE,
    shadowColor: ORANGE, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  btnConfirmText: { color: '#fff', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },

  // Center popup modal styles
  modalCenter: { margin: 24, justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.7,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    paddingBottom: 8,
    ...Platform.select({
      android: { elevation: 10 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
    }),
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY, flex: 1 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f2f2f2',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f5f5f8' },
  pickerLabel: { fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },
  pickerSub: { fontSize: 11, color: '#6b7280', marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  emptyPicker: { textAlign: 'center', padding: 30, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium },
});

export default PaymentMethodFormScreen;
