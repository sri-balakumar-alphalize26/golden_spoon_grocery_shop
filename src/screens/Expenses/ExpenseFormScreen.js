import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Image,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import SourcePickerModal from '@components/Modal/SourcePickerModal';
import InAppCameraModal from '@components/IdProof/InAppCameraModal';
import ReceiptHeaderBranding from '@components/common/Receipt/ReceiptHeaderBranding';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import {
  fetchExpenseCategoriesOdoo,
  createExpenseOdoo,
  updateExpenseOdoo,
  fetchExpensesOdoo,
  fetchCurrentEmployeeIdOdoo,
  attachReceiptToExpenseOdoo,
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

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const companyProfile = useAuthStore((state) => state.companyProfile);
  // Pull the freshest company letterhead from Odoo on every focus.
  useFocusEffect(useCallback(() => {
    try { useAuthStore.getState().refreshCompanyProfile?.(); } catch (_) {}
    try { useAuthStore.getState().refreshUserProfile?.(); } catch (_) {}
  }, []));

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

  // Receipts staged locally — uploaded after the hr.expense row exists,
  // because ir.attachment requires res_id.
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState(null);
  const [viewerId, setViewerId] = useState(null);

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

  // Stage a new attachment OR swap an existing row when `replaceTargetId`
  // is set (from a Replace tap). Either way the target is cleared after.
  const stageAttachment = (att) => {
    setPendingAttachments((prev) => {
      if (replaceTargetId) {
        const idx = prev.findIndex((a) => a.id === replaceTargetId);
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = { ...att, id: replaceTargetId };
          return next;
        }
      }
      return [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...att },
      ];
    });
    setReplaceTargetId(null);
  };

  const removeAttachment = (id) =>
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));

  const requestReplace = (id) => {
    if (saving) return;
    setReplaceTargetId(id);
    setSourcePickerOpen(true);
  };

  const closeSourcePicker = () => {
    setSourcePickerOpen(false);
    setReplaceTargetId(null);
  };

  // Gallery only — system gallery picker is safe (no OOM-prone OS camera
  // intent). Camera capture goes through InAppCameraModal instead.
  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.base64) return;
    const ext = (asset.uri?.match(/\.([a-zA-Z0-9]+)(\?|$)/)?.[1] || 'jpg').toLowerCase();
    const mime = asset.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg');
    stageAttachment({
      base64: asset.base64,
      mimetype: mime,
      filename: `receipt-${Date.now()}.${ext}`,
      size: asset.fileSize || Math.ceil((asset.base64.length * 3) / 4),
      previewUri: asset.uri,
    });
  };

  const openCamera = () => setCameraVisible(true);

  const handleCameraCapture = (base64) => {
    setCameraVisible(false);
    if (!base64) return;
    stageAttachment({
      base64,
      mimetype: 'image/jpeg',
      filename: `receipt-${Date.now()}.jpg`,
      size: Math.ceil((base64.length * 3) / 4),
      previewUri: `data:image/jpeg;base64,${base64}`,
    });
  };

  const pickFromDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    let base64;
    try {
      base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Attach failed', text2: 'Could not read file', position: 'bottom' });
      return;
    }
    const mime = asset.mimeType || 'application/octet-stream';
    stageAttachment({
      base64,
      mimetype: mime,
      filename: asset.name || `receipt-${Date.now()}`,
      size: asset.size || Math.ceil((base64.length * 3) / 4),
      previewUri: mime.startsWith('image/') ? asset.uri : null,
    });
  };

  const handleAttachReceipt = () => {
    if (saving) return;
    setSourcePickerOpen(true);
  };

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

      // Upload any staged receipts now that the hr.expense row exists.
      // Attachment failures are surfaced per-file but do not roll back the
      // expense itself.
      const expenseId = isEdit ? editId : resp.result;
      let attachFailures = 0;
      if (expenseId && pendingAttachments.length > 0) {
        for (const att of pendingAttachments) {
          const r = await attachReceiptToExpenseOdoo({
            expenseId,
            base64: att.base64,
            mimetype: att.mimetype,
            filename: att.filename,
          });
          if (r?.error) {
            attachFailures += 1;
            Toast.show({
              type: 'error',
              text1: `Receipt "${att.filename}" failed`,
              text2: r.error.message || r.error.data?.message || '',
              position: 'bottom',
            });
          }
        }
      }

      Toast.show({
        type: 'success',
        text1: isEdit ? 'Expense updated' : 'Expense created',
        text2: pendingAttachments.length > 0
          ? `${pendingAttachments.length - attachFailures}/${pendingAttachments.length} receipt(s) attached`
          : undefined,
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

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Receipts</Text>
              <TouchableOpacity
                style={[styles.attachBtn, saving && { opacity: 0.6 }]}
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleAttachReceipt}
              >
                <MaterialIcons name="attach-file" size={18} color={NAVY} />
                <Text style={styles.attachBtnText}>Attach Receipt</Text>
              </TouchableOpacity>

              {pendingAttachments.length > 0 ? (
                <View style={styles.attachList}>
                  {pendingAttachments.map((att) => {
                    const isImage = (att.mimetype || '').startsWith('image/');
                    const ThumbWrap = isImage ? TouchableOpacity : View;
                    const thumbProps = isImage
                      ? { activeOpacity: 0.85, onPress: () => setViewerId(att.id) }
                      : {};
                    return (
                      <View key={att.id} style={styles.attachRow}>
                        <ThumbWrap {...thumbProps}>
                          {att.previewUri ? (
                            <Image source={{ uri: att.previewUri }} style={styles.attachThumb} />
                          ) : (
                            <View style={[styles.attachThumb, styles.attachIconBox]}>
                              <MaterialIcons
                                name={att.mimetype === 'application/pdf' ? 'picture-as-pdf' : 'insert-drive-file'}
                                size={22}
                                color={NAVY}
                              />
                            </View>
                          )}
                        </ThumbWrap>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.attachName} numberOfLines={1}>{att.filename}</Text>
                          <Text style={styles.attachMeta}>{formatBytes(att.size)}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => requestReplace(att.id)}
                          disabled={saving}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.attachReplaceBtn}
                        >
                          <MaterialIcons name="cached" size={20} color={NAVY} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => removeAttachment(att.id)}
                          disabled={saving}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.attachRemoveBtn}
                        >
                          <MaterialIcons name="delete-outline" size={20} color="#B91C1C" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
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

      <SourcePickerModal
        isVisible={sourcePickerOpen}
        onClose={closeSourcePicker}
        onPickCamera={openCamera}
        onPickGallery={pickFromGallery}
        onPickFile={pickFromDocument}
      />

      <InAppCameraModal
        visible={cameraVisible}
        onCapture={handleCameraCapture}
        onClose={() => setCameraVisible(false)}
      />

      <Modal
        visible={!!viewerId}
        animationType="fade"
        transparent
        onRequestClose={() => setViewerId(null)}
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <TouchableOpacity
          style={styles.viewerBg}
          activeOpacity={1}
          onPress={() => setViewerId(null)}
        >
          {(() => {
            const item = pendingAttachments.find((a) => a.id === viewerId);
            return item?.previewUri ? (
              <Image source={{ uri: item.previewUri }} style={styles.viewerImg} />
            ) : null;
          })()}
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewerId(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.viewerBrandingWrap} pointerEvents="none">
            <ReceiptHeaderBranding companyProfile={companyProfile} tint="#fff" />
          </View>
        </TouchableOpacity>
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

  attachBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderStyle: 'dashed',
    paddingVertical: 12,
    gap: 8,
  },
  attachBtnText: {
    color: NAVY,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  attachList: { marginTop: 10, gap: 8 },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  attachThumb: {
    width: 44, height: 44,
    borderRadius: 8,
    backgroundColor: '#EEF2F7',
  },
  attachIconBox: { alignItems: 'center', justifyContent: 'center' },
  attachName: { fontSize: 13, color: '#1f2937', fontFamily: FONT_FAMILY.urbanistBold },
  attachMeta: { fontSize: 11, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2 },
  attachReplaceBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#E0E7FF',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  attachRemoveBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },

  viewerBg: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  viewerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBrandingWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

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
    borderWidth: 2,
    borderColor: NAVY,
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
