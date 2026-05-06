import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import {
  fetchExpenseCategoriesOdoo,
  createExpenseOdoo,
  updateExpenseOdoo,
  fetchExpensesOdoo,
  fetchCurrentEmployeeIdOdoo,
} from '@api/services/generalApi';
import Toast from 'react-native-toast-message';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#9CA3AF';

const todayIso = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDateLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ExpenseFormScreen = ({ navigation, route }) => {
  const editId = route?.params?.expenseId || null;
  const isEdit = !!editId;
  const authUser = useAuthStore((state) => state.user);

  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(isEdit);

  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('own_account');
  const [description, setDescription] = useState('');

  const [categories, setCategories] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Resolve current employee. Required for create.
  const [employeeId, setEmployeeId] = useState(null);
  useEffect(() => {
    const uid = authUser?.uid || authUser?.id;
    if (uid) fetchCurrentEmployeeIdOdoo(uid).then((emp) => emp?.id && setEmployeeId(emp.id));
  }, [authUser]);

  // Load categories.
  useEffect(() => {
    fetchExpenseCategoriesOdoo().then((cats) => setCategories(cats || []));
  }, []);

  // Edit-mode prefill (re-fetch the row to be safe).
  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    (async () => {
      try {
        // The list helper supports filtering by id via search domain — easier
        // than adding a single-row helper.
        const uid = authUser?.uid || authUser?.id;
        const emp = await fetchCurrentEmployeeIdOdoo(uid);
        const all = await fetchExpensesOdoo({ employeeId: emp?.id, limit: 200 });
        const row = (all || []).find((e) => e.id === editId);
        if (!alive || !row) return;
        setName(row.name || '');
        setDate(row.date || todayIso());
        setTotalAmount(row.total_amount != null ? String(row.total_amount) : '');
        setPaymentMode(row.payment_mode || 'own_account');
        setDescription(row.description || '');
        if (row.category?.id) setCategory({ id: row.category.id, name: row.category.name });
      } finally {
        if (alive) setPrefilling(false);
      }
    })();
    return () => { alive = false; };
  }, [isEdit, editId, authUser]);

  const filteredCats = categories.filter((c) =>
    !pickerSearch || (c.name || '').toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Description is required', position: 'bottom' });
      return;
    }
    if (!isEdit && !employeeId) {
      Toast.show({ type: 'error', text1: 'No employee linked to your user', position: 'bottom' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        date,
        productId: category?.id,
        totalAmount,
        paymentMode,
        description,
        employeeId,
      };
      const resp = isEdit
        ? await updateExpenseOdoo(editId, payload)
        : await createExpenseOdoo(payload);
      if (resp?.error) {
        Toast.show({
          type: 'error',
          text1: isEdit ? 'Save failed' : 'Create failed',
          text2: resp.error.message || resp.error.data?.message || '',
          position: 'bottom',
        });
        return;
      }
      Toast.show({
        type: 'success',
        text1: isEdit ? 'Expense updated' : 'Expense created',
        position: 'bottom',
      });
      // Pop back to wherever we came from with a stamp so the list refreshes.
      navigation.goBack();
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Save failed', text2: e?.message || '', position: 'bottom' });
    } finally {
      setSaving(false);
    }
  };

  if (prefilling) {
    return (
      <SafeAreaView backgroundColor="#F5F6FA">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor="#F5F6FA">
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.headerBtn}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Expense' : 'New Expense'}</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.headerBtn}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <Field label="Description *" value={name} onChangeText={setName} placeholder="What is this expense for?" />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date</Text>
              <TextInput
                style={styles.fieldInput}
                value={formatDateLabel(date)}
                editable={false}
                placeholderTextColor="#aaa"
              />
              <Text style={styles.fieldHint}>Format YYYY-MM-DD: {date}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                activeOpacity={0.75}
                onPress={() => setPickerOpen(true)}
              >
                <Text style={[styles.pickerBtnText, !category && { color: '#aaa' }]} numberOfLines={1}>
                  {category?.name || 'Select category'}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={22} color={MUTED} />
              </TouchableOpacity>
            </View>

            <Field
              label="Total Amount *"
              value={totalAmount}
              onChangeText={setTotalAmount}
              placeholder="0.00"
              keyboardType="numeric"
            />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Paid By</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, paymentMode === 'own_account' && styles.segmentBtnActive]}
                  activeOpacity={0.85}
                  onPress={() => setPaymentMode('own_account')}
                >
                  <Text style={[styles.segmentText, paymentMode === 'own_account' && styles.segmentTextActive]}>
                    Employee (to reimburse)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, paymentMode === 'company_account' && styles.segmentBtnActive]}
                  activeOpacity={0.85}
                  onPress={() => setPaymentMode('company_account')}
                >
                  <Text style={[styles.segmentText, paymentMode === 'company_account' && styles.segmentTextActive]}>
                    Company
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Field
              label="Notes"
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              multiline
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Create Expense'}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Centered category picker */}
      <Modal visible={pickerOpen} animationType="fade" transparent onRequestClose={() => setPickerOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerCard}>
                <View style={styles.pickerCardHeader}>
                  <Text style={styles.pickerHeaderTitle}>Select Category</Text>
                  <TouchableOpacity
                    onPress={() => setPickerOpen(false)}
                    style={styles.pickerCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="close" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>
                <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 }}>
                  <TextInput
                    style={styles.pickerSearch}
                    placeholder="Search…"
                    placeholderTextColor={MUTED}
                    value={pickerSearch}
                    onChangeText={setPickerSearch}
                  />
                </View>
                <FlatList
                  data={filteredCats}
                  keyExtractor={(item, idx) => `c-${item.id}-${idx}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.pickerRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        setCategory(item);
                        setPickerOpen(false);
                      }}
                    >
                      <Text style={styles.pickerRowText}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={(
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ color: MUTED }}>No expense categories</Text>
                    </View>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
};

const Field = ({ label, value, onChangeText, placeholder, keyboardType, multiline }) => {
  const isNumeric = keyboardType === 'numeric' || keyboardType === 'phone-pad' || keyboardType === 'decimal-pad';
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        keyboardType={keyboardType || 'default'}
        multiline={!!multiline}
        selectTextOnFocus={isNumeric}
      />
    </View>
  );
};

export default ExpenseFormScreen;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: NAVY,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 17,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  headerBtn: {
    fontSize: 15,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
  },

  formContent: { padding: 16, paddingBottom: 60, backgroundColor: '#F5F6FA' },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 12, color: '#6b7280',
    fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14, color: '#1f2937',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  fieldHint: {
    fontSize: 11, color: '#6b7280',
    fontStyle: 'italic', marginTop: 4, paddingLeft: 2,
  },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  pickerBtnText: { fontSize: 14, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistMedium, flex: 1 },

  segmentRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: NAVY,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: { backgroundColor: NAVY },
  segmentText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  segmentTextActive: { color: '#fff' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORANGE, borderRadius: 12,
    paddingVertical: 16, marginTop: 20, marginBottom: 20, gap: 8,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4 },

  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: Math.min(Dimensions.get('window').height * 0.78, 560),
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 14 },
    }),
  },
  pickerCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#eef0f5',
  },
  pickerCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerHeaderTitle: { fontSize: 16, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.2 },
  pickerSearch: {
    backgroundColor: '#F3F4F6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 14, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistMedium,
  },
  pickerRow: {
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  pickerRowText: { fontSize: 14, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistMedium },
});
