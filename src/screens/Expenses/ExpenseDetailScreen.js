import React, { useEffect, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  Modal,
  TextInput,
  ActionSheetIOS,
  Alert,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from '@components/containers';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { FeatureGate } from '@components/FeatureGate';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import {
  fetchExpensesOdoo,
  fetchExpenseByIdOdoo,
  submitExpenseOdoo,
  approveExpenseSheetOdoo,
  refuseExpenseSheetOdoo,
  resetExpenseSheetOdoo,
  postExpenseEntriesOdoo,
  attachReceiptToExpenseOdoo,
  fetchExpenseAttachmentsOdoo,
} from '@api/services/generalApi';
import Toast from 'react-native-toast-message';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

const STATE_BADGE = {
  draft: { bg: '#E0F2FE', fg: '#075985', label: 'Draft' },
  reported: { bg: '#FEF3C7', fg: '#92400E', label: 'Submitted' },
  approved: { bg: '#DCFCE7', fg: '#166534', label: 'Approved' },
  done: { bg: '#E5E7EB', fg: '#374151', label: 'Paid' },
  refused: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Refused' },
};

// Same UTC-parse fix as MyOrders/OrderDetailScreen — Odoo emits naive UTC
// strings, Hermes treats them as local without an explicit Z, shifting the
// displayed date by the user's offset.
const formatDate = (s) => {
  if (!s) return '—';
  const str = String(s);
  const iso = str.includes('T') ? str : str.replace(' ', 'T');
  const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  const d = new Date(withTz);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ExpenseDetailScreen = ({ navigation, route }) => {
  const { expenseId } = route?.params || {};
  const authUser = useAuthStore((state) => state.user);
  const currency = useAuthStore((state) => state.currency) || { symbol: 'ر.ع.', position: 'before' };

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [expense, setExpense] = useState(null);
  const [refuseModalVisible, setRefuseModalVisible] = useState(false);
  const [refuseReason, setRefuseReason] = useState('');

  // Receipts attached to this expense — fetched as ir.attachment rows.
  // The viewer modal flips through them with prev/next arrows like Odoo.
  const [attachments, setAttachments] = useState([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const reloadAttachments = async () => {
    if (!expenseId) return;
    try {
      const list = await fetchExpenseAttachmentsOdoo(expenseId);
      setAttachments(Array.isArray(list) ? list : []);
    } catch (_) {
      // Best-effort; an attachment fetch failure shouldn't break the page.
    }
  };

  const load = async () => {
    if (!expenseId) {
      setLoading(false);
      return;
    }
    try {
      // Don't pre-narrow by current employee: admins click into other
      // employees' rows from the list, and Odoo's record rules already
      // limit non-admins to their own. Pulling everything the user can
      // see and finding by id matches what the list screen shows.
      const [all] = await Promise.all([
        fetchExpensesOdoo({ limit: 500 }),
        reloadAttachments(),
      ]);
      const row = (all || []).find((e) => e.id === expenseId);
      setExpense(row || null);
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Failed to load expense', position: 'bottom' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  const handleSubmit = async () => {
    if (!expense || expense.state !== 'draft') return;
    setSubmitting(true);
    try {
      const resp = await submitExpenseOdoo(expense.id);
      if (resp?.error) {
        Toast.show({
          type: 'error',
          text1: 'Submit failed',
          text2: resp.error.message || resp.error.data?.message || '',
          position: 'bottom',
        });
        return;
      }
      Toast.show({ type: 'success', text1: 'Expense submitted', position: 'bottom' });
      await refreshExpense();
    } finally {
      setSubmitting(false);
    }
  };

  // Refresh just THIS expense by id — much faster than reloading the
  // whole list and finding the matching row, and Odoo has just-written
  // state available on a direct read so the UI flips immediately.
  const refreshExpense = async () => {
    if (!expense?.id) return;
    try {
      const fresh = await fetchExpenseByIdOdoo(expense.id);
      if (fresh) setExpense(fresh);
      reloadAttachments();
    } catch (_) {
      // Best-effort; the toast already told the user the action succeeded.
    }
  };

  // Workflow actions try the modern hr.expense methods first and fall
  // back to hr.expense.sheet on older Odoo. Pass both ids so the API
  // helper can pick whichever model has the method.
  const runWorkflowAction = async (label, fn) => {
    setActing(true);
    try {
      const resp = await fn(expense?.sheet_id || null, expense?.id);
      if (resp?.error) {
        Toast.show({
          type: 'error',
          text1: `${label} failed`,
          text2: resp.error.message || resp.error.data?.message || '',
          position: 'bottom',
        });
        return;
      }
      Toast.show({ type: 'success', text1: `${label}d`, position: 'bottom' });
      // Refresh the on-screen state right away so the badge / button bar
      // reflects the new state without the user having to navigate back.
      await refreshExpense();
    } finally {
      setActing(false);
    }
  };

  // Attach Receipt — picks an image (camera/gallery) OR any document
  // (PDF, Excel, etc.) and uploads as a base64 ir.attachment linked to
  // this expense. Mirrors Odoo's Attach Receipt behaviour, which accepts
  // any mimetype.
  const uploadBase64 = async ({ base64, mimetype, filename }) => {
    if (!base64) {
      Toast.show({ type: 'error', text1: 'Attach failed', text2: 'No file data', position: 'bottom' });
      return;
    }
    setActing(true);
    try {
      const resp = await attachReceiptToExpenseOdoo({
        expenseId: expense.id,
        base64,
        mimetype,
        filename,
      });
      if (resp?.error) {
        Toast.show({
          type: 'error',
          text1: 'Attach failed',
          text2: resp.error.message || resp.error.data?.message || '',
          position: 'bottom',
        });
        return;
      }
      Toast.show({ type: 'success', text1: 'Receipt attached', position: 'bottom' });
      reloadAttachments();
    } finally {
      setActing(false);
    }
  };

  const pickFromImage = async (mode) => {
    const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 };
    const res = mode === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset) return;
    const ext = (asset.uri?.match(/\.([a-zA-Z0-9]+)(\?|$)/)?.[1] || 'jpg').toLowerCase();
    const mime = asset.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg');
    await uploadBase64({
      base64: asset.base64,
      mimetype: mime,
      filename: `receipt-${Date.now()}.${ext}`,
    });
  };

  const pickFromDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      // Accept any mimetype — Odoo handles PDF, Excel, Word, images,
      // anything. The user just told us they want jpg/jpeg/png/pdf/xlsx.
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    let base64;
    try {
      base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Attach failed', text2: 'Could not read file', position: 'bottom' });
      return;
    }
    await uploadBase64({
      base64,
      mimetype: asset.mimeType || 'application/octet-stream',
      filename: asset.name || `receipt-${Date.now()}`,
    });
  };

  const handleAttachReceipt = () => {
    // Action sheet — Camera / Gallery / File. iOS gets the native sheet,
    // Android falls back to an Alert with the same three options.
    const options = ['Camera', 'Gallery', 'File (PDF, Excel…)', 'Cancel'];
    const dispatch = (idx) => {
      if (idx === 0) pickFromImage('camera');
      else if (idx === 1) pickFromImage('gallery');
      else if (idx === 2) pickFromDocument();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, title: 'Attach Receipt' },
        dispatch
      );
    } else {
      Alert.alert('Attach Receipt', 'Choose a source', [
        { text: 'Camera', onPress: () => dispatch(0) },
        { text: 'Gallery', onPress: () => dispatch(1) },
        { text: 'File (PDF, Excel…)', onPress: () => dispatch(2) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // Split Expense — Odoo's split flow launches a multi-line wizard which
  // is heavyweight to mirror in RN. Surface a clear pointer toast for now
  // so the cashier knows where to perform the split (Odoo web client),
  // and we can build a native multi-line wizard as a follow-up.
  const handleSplitExpense = () => {
    Toast.show({
      type: 'info',
      text1: 'Split Expense',
      text2: 'Open this expense in the Odoo web client to split it across categories.',
      position: 'bottom',
    });
  };

  const handleApprove = () => runWorkflowAction('Approve', (sid, eid) => approveExpenseSheetOdoo(sid, eid));
  const handleReset = () => runWorkflowAction('Reset', (sid, eid) => resetExpenseSheetOdoo(sid, eid));
  const handlePost = () => runWorkflowAction('Post', (sid, eid) => postExpenseEntriesOdoo(sid, eid));
  const handleRefuseConfirm = async () => {
    const reason = refuseReason.trim();
    if (!reason) {
      Toast.show({ type: 'error', text1: 'Reason required', text2: 'Tell the employee why this expense is refused.', position: 'bottom' });
      return;
    }
    setRefuseModalVisible(false);
    await runWorkflowAction('Refuse', (sid, eid) => refuseExpenseSheetOdoo(sid, reason, eid));
    setRefuseReason('');
  };

  if (loading) {
    return (
      <SafeAreaView backgroundColor="#F5F6FA">
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Expense</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView backgroundColor="#F5F6FA">
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Expense</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: MUTED }}>Expense not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = STATE_BADGE[expense.state] || STATE_BADGE.draft;
  const paidByLabel = expense.payment_mode === 'company_account'
    ? 'Company'
    : 'Employee (to reimburse)';

  return (
    <SafeAreaView backgroundColor="#F5F6FA">
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{expense.name || 'Expense'}</Text>
        {expense.state === 'draft' ? (
          <FeatureGate
            featureKey="expenses.edit"
            fallback={<View style={{ width: 36 }} />}
          >
            <TouchableOpacity
              onPress={() => navigation.navigate('ExpenseForm', { expenseId: expense.id })}
              style={styles.editBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="edit" size={20} color="#fff" />
            </TouchableOpacity>
          </FeatureGate>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        <StateStepper state={expense.state} />

        {/* Yellow warning when Odoo flagged this expense's receipt as a
            duplicate of another expense's. `duplicate_expense_ids` is
            populated server-side when matching attachment hashes are
            found across hr.expense rows. */}
        {expense.duplicate_expense_ids && expense.duplicate_expense_ids.length > 0 ? (
          <View style={styles.duplicateBanner}>
            <MaterialIcons name="warning-amber" size={18} color="#92400E" />
            <Text style={styles.duplicateBannerText}>
              An expense with the same receipt already exists.
            </Text>
          </View>
        ) : null}

        {/* Hero */}
        <View style={styles.heroCard}>
          <Text style={styles.descLabel}>DESCRIPTION</Text>
          <Text style={styles.descValue}>{expense.name || '—'}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountText}>
              {formatCurrency(expense.total_amount, currency)}
            </Text>
            <View style={[styles.statePill, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statePillText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          </View>
        </View>

        {/* Details */}
        <Text style={styles.sectionTitle}>DETAILS</Text>
        <View style={styles.card}>
          <Row icon="event" label="Date" value={formatDate(expense.date)} />
          <Row icon="category" label="Category" value={expense.category?.name || '—'} />
          <Row icon="account-balance-wallet" label="Paid By" value={paidByLabel} />
          <Row icon="person" label="Employee" value={expense.employee?.name || '—'} last={!expense.description} />
          {expense.description ? (
            <Row icon="notes" label="Notes" value={expense.description} last />
          ) : null}
        </View>

        {/* State-conditional actions — mirrors Odoo's expense detail
            button bar. The exact set depends on the current state:
              draft                → Submit to Manager
              reported / submitted → Approve · Refuse · Reset to Draft
              approved             → Refuse · Reset to Draft (Post Journal
                                     Entries / Register Payment are
                                     accountant-only and not yet wired)
              done / paid          → (closed)
              refused              → Reset to Draft */}
        {expense.state === 'draft' ? (
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            activeOpacity={0.85}
            disabled={submitting}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Submit to Manager</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Attach Receipt — available everywhere except fully-paid (closed)
            states, mirroring Odoo where the paperclip stays visible.
            Sits beside View Receipt when there's at least one attachment
            so the cashier can flip between adding and viewing. */}
        <View style={styles.receiptRow}>
          {expense.state !== 'paid' ? (
            <TouchableOpacity
              style={[styles.attachBtn, { flex: 1 }, acting && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={acting}
              onPress={handleAttachReceipt}
            >
              <MaterialIcons name="attach-file" size={18} color={NAVY} />
              <Text style={styles.attachBtnText}>Attach Receipt</Text>
            </TouchableOpacity>
          ) : null}
          {attachments.length > 0 ? (
            <TouchableOpacity
              style={[styles.viewBtn, { flex: 1 }]}
              activeOpacity={0.85}
              onPress={() => { setViewerIndex(0); setViewerVisible(true); }}
            >
              <MaterialIcons name="visibility" size={18} color="#fff" />
              <Text style={styles.viewBtnText}>
                {`View Receipt${attachments.length > 1 ? `s (${attachments.length})` : ''}`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {expense.state === 'reported' || expense.state === 'submitted' ? (
          <View style={styles.actionRow}>
            <FeatureGate featureKey="expenses.approve">
              <TouchableOpacity
                style={[styles.approveBtn, acting && { opacity: 0.6 }]}
                activeOpacity={0.85}
                disabled={acting}
                onPress={handleApprove}
              >
                <MaterialIcons name="check" size={18} color="#fff" />
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
            </FeatureGate>
            <FeatureGate featureKey="expenses.refuse">
              <TouchableOpacity
                style={[styles.refuseBtn, acting && { opacity: 0.6 }]}
                activeOpacity={0.85}
                disabled={acting}
                onPress={() => setRefuseModalVisible(true)}
              >
                <MaterialIcons name="close" size={18} color="#fff" />
                <Text style={styles.refuseBtnText}>Refuse</Text>
              </TouchableOpacity>
            </FeatureGate>
          </View>
        ) : null}

        {/* Approved → Post Journal Entries (accountant) + Refuse + Reset
            + Split Expense */}
        {expense.state === 'approved' ? (
          <>
            <TouchableOpacity
              style={[styles.postBtn, acting && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={acting}
              onPress={handlePost}
            >
              <MaterialIcons name="receipt-long" size={18} color="#fff" />
              <Text style={styles.postBtnText}>Post Journal Entries</Text>
            </TouchableOpacity>
            <FeatureGate featureKey="expenses.refuse">
              <TouchableOpacity
                style={[styles.refuseBtn, acting && { opacity: 0.6 }]}
                activeOpacity={0.85}
                disabled={acting}
                onPress={() => setRefuseModalVisible(true)}
              >
                <MaterialIcons name="close" size={18} color="#fff" />
                <Text style={styles.refuseBtnText}>Refuse</Text>
              </TouchableOpacity>
            </FeatureGate>
            <TouchableOpacity
              style={[styles.splitBtn, acting && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={acting}
              onPress={handleSplitExpense}
            >
              <MaterialIcons name="call-split" size={18} color={NAVY} />
              <Text style={styles.splitBtnText}>Split Expense</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {/* Reset to Draft — available on every non-draft state so the
            cashier can edit a refused/submitted/approved/posted expense. */}
        {expense.state !== 'draft' && expense.state !== 'paid' ? (
          <TouchableOpacity
            style={[styles.resetBtn, acting && { opacity: 0.6 }]}
            activeOpacity={0.85}
            disabled={acting}
            onPress={handleReset}
          >
            <MaterialIcons name="undo" size={18} color={NAVY} />
            <Text style={styles.resetBtnText}>Reset to Draft</Text>
          </TouchableOpacity>
        ) : null}

        {(expense.state === 'done' || expense.state === 'paid') ? (
          <View style={styles.lockedBanner}>
            <MaterialIcons name="lock-outline" size={16} color="#92400E" />
            <Text style={styles.lockedText}>Reimbursed. This expense is closed.</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Receipt viewer — flips through every attachment with prev/next
          arrows like Odoo. Renders images inline; PDFs in a WebView via
          base64 data URL; everything else gets an "Open with…" button
          that writes the file to cache and opens the share sheet. */}
      <ReceiptViewer
        visible={viewerVisible}
        attachments={attachments}
        index={viewerIndex}
        onClose={() => setViewerVisible(false)}
        onPrev={() => setViewerIndex((i) => (i - 1 + attachments.length) % attachments.length)}
        onNext={() => setViewerIndex((i) => (i + 1) % attachments.length)}
      />

      {/* Refuse-with-reason modal — Odoo requires a reason on refuse so
          the employee knows why their expense was rejected. */}
      <Modal
        visible={refuseModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setRefuseModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Refuse Expense</Text>
            <Text style={styles.modalSubtitle}>
              Tell the employee why this expense is being refused.
            </Text>
            <TextInput
              value={refuseReason}
              onChangeText={setRefuseReason}
              placeholder="Reason"
              placeholderTextColor="#9ca3af"
              multiline
              style={styles.modalInput}
            />
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                activeOpacity={0.85}
                onPress={() => { setRefuseModalVisible(false); setRefuseReason(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                activeOpacity={0.85}
                onPress={handleRefuseConfirm}
              >
                <Text style={styles.modalConfirmText}>Refuse</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// Horizontal state stepper — mirrors Odoo's status-bar widget at the top
// of the form view. Steps run Draft → Approved → Posted → Paid; Refused
// is rendered as a separate exit chip on the right (it only highlights
// when the expense is in that terminal state). The current step gets a
// solid navy fill; everything before it shows as a tinted "completed"
// chip; everything after shows as outlined "pending".
const STEPPER_STAGES = [
  { key: 'draft',    label: 'Draft',    matches: ['draft'] },
  { key: 'approved', label: 'Approved', matches: ['submitted', 'reported', 'approved'] },
  { key: 'done',     label: 'Posted',   matches: ['done'] },
  { key: 'paid',     label: 'Paid',     matches: ['paid'] },
];
const stepIndexForState = (state) => {
  const idx = STEPPER_STAGES.findIndex((s) => s.matches.includes(state));
  return idx === -1 ? 0 : idx;
};

const StateStepper = ({ state }) => {
  const refused = state === 'refused';
  const activeIdx = stepIndexForState(state);
  return (
    <View style={styles.stepperRow}>
      {STEPPER_STAGES.map((stage, idx) => {
        const completed = !refused && idx < activeIdx;
        const active = !refused && idx === activeIdx;
        const pillStyle = active
          ? styles.stepperActive
          : completed
            ? styles.stepperCompleted
            : styles.stepperPending;
        const textStyle = active
          ? styles.stepperActiveText
          : completed
            ? styles.stepperCompletedText
            : styles.stepperPendingText;
        return (
          <View key={stage.key} style={[styles.stepperPill, pillStyle]}>
            <Text style={[styles.stepperPillText, textStyle]} numberOfLines={1}>
              {stage.label}
            </Text>
          </View>
        );
      })}
      <View style={[styles.stepperPill, refused ? styles.stepperRefusedActive : styles.stepperRefusedPending]}>
        <Text style={[styles.stepperPillText, refused ? styles.stepperRefusedActiveText : styles.stepperRefusedPendingText]}>
          Refused
        </Text>
      </View>
    </View>
  );
};

// Save an attachment's base64 to the user's chosen folder (Android
// Storage Access Framework) or surface the iOS share sheet's "Save to
// Files" entry. Used by the viewer footer's Download button.
const downloadAttachment = async (attachment) => {
  if (!attachment?.datas) {
    Toast.show({ type: 'error', text1: 'Download failed', text2: 'No file data', position: 'bottom' });
    return;
  }
  const { mimetype, datas, name, id } = attachment;
  const safeName = (name || `attachment-${id}`).replace(/[^A-Za-z0-9._-]/g, '_');
  const cachePath = `${FileSystem.cacheDirectory}${safeName}`;
  try {
    await FileSystem.writeAsStringAsync(cachePath, datas, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (Platform.OS === 'android') {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        Toast.show({ type: 'info', text1: 'Save cancelled', position: 'bottom' });
        return;
      }
      const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        safeName,
        mimetype || 'application/octet-stream'
      );
      await FileSystem.writeAsStringAsync(targetUri, datas, {
        encoding: FileSystem.EncodingType.Base64,
      });
      Toast.show({ type: 'success', text1: 'Saved', text2: safeName, position: 'bottom' });
    } else {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(cachePath, { mimeType: mimetype, dialogTitle: safeName });
      }
    }
  } catch (e) {
    Toast.show({ type: 'error', text1: 'Download failed', text2: e?.message || 'Unable to download', position: 'bottom' });
  }
};

// Render one attachment by mimetype:
//  - image/* → inline <Image>
//  - application/pdf → iOS WebView (Safari's built-in PDF engine);
//      Android: icon + label only (download is in the viewer footer).
//  - audio/* → icon + label only.
//  - everything else → icon + label only.
//
// All actions (including image downloads) live in the viewer footer's
// centred Download button — see ReceiptViewer below.
const ReceiptBody = ({ attachment }) => {
  if (!attachment) return null;
  const { mimetype, datas, name, url } = attachment;
  const isImage = (mimetype || '').startsWith('image/');
  const isPdf = mimetype === 'application/pdf';
  const isAudio = (mimetype || '').startsWith('audio/');

  if (isImage && datas) {
    return (
      <Image
        source={{ uri: `data:${mimetype};base64,${datas}` }}
        style={{ flex: 1, resizeMode: 'contain', backgroundColor: '#000' }}
      />
    );
  }
  if (isPdf) {
    // iOS Safari renders PDFs inline using the Odoo URL + session cookie.
    if (Platform.OS === 'ios' && url) {
      return (
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <WebView source={{ uri: url }} style={{ flex: 1 }} />
        </View>
      );
    }
    // Android: just show what we have; Download lives in the footer.
    return (
      <View style={styles.viewerGenericBox}>
        <MaterialIcons name="picture-as-pdf" size={64} color="#DC2626" />
        <Text style={styles.viewerGenericName} numberOfLines={2}>{name}</Text>
        <Text style={styles.viewerGenericMime}>PDF document</Text>
      </View>
    );
  }
  if (isAudio) {
    return (
      <View style={styles.viewerGenericBox}>
        <MaterialIcons name="audiotrack" size={64} color={NAVY} />
        <Text style={styles.viewerGenericName} numberOfLines={2}>{name}</Text>
        <Text style={styles.viewerGenericMime}>Audio recording</Text>
      </View>
    );
  }
  // Generic file — Excel, Word, anything we can't render natively.
  return (
    <View style={styles.viewerGenericBox}>
      <MaterialIcons name="description" size={56} color={MUTED} />
      <Text style={styles.viewerGenericName} numberOfLines={2}>{name}</Text>
      <Text style={styles.viewerGenericMime}>{mimetype}</Text>
    </View>
  );
};

const ReceiptViewer = ({ visible, attachments, index, onClose, onPrev, onNext }) => {
  const total = attachments?.length || 0;
  const current = total > 0 ? attachments[index] : null;
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!current) return;
    setDownloading(true);
    try {
      await downloadAttachment(current);
    } finally {
      setDownloading(false);
    }
  };

  // Footer layout: a single centred Download when there's only one
  // attachment; Prev / Download / Next (three equal columns) when there
  // are 2+ so Download stays visually centred between the nav arrows.
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.viewerContainer}>
        <View style={styles.viewerHeader}>
          <Text style={styles.viewerTitle} numberOfLines={1}>{current?.name || 'Receipt'}</Text>
          <Text style={styles.viewerCounter}>{total > 0 ? `${index + 1} of ${total}` : '—'}</Text>
          <TouchableOpacity onPress={onClose} style={styles.viewerClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.viewerBody}>
          <ReceiptBody attachment={current} />
        </View>
        <View style={styles.viewerNavRow}>
          {total > 1 ? (
            <TouchableOpacity onPress={onPrev} style={styles.viewerNavBtn} activeOpacity={0.85}>
              <MaterialIcons name="chevron-left" size={24} color={NAVY} />
              <Text style={styles.viewerNavText}>Prev</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.viewerNavSpacer} />
          )}
          <TouchableOpacity
            onPress={handleDownload}
            style={styles.viewerDownloadBtn}
            activeOpacity={0.85}
            disabled={downloading || !current}
          >
            {downloading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="file-download" size={20} color="#fff" />
                <Text style={styles.viewerDownloadText}>Download</Text>
              </>
            )}
          </TouchableOpacity>
          {total > 1 ? (
            <TouchableOpacity onPress={onNext} style={styles.viewerNavBtn} activeOpacity={0.85}>
              <Text style={styles.viewerNavText}>Next</Text>
              <MaterialIcons name="chevron-right" size={24} color={NAVY} />
            </TouchableOpacity>
          ) : (
            <View style={styles.viewerNavSpacer} />
          )}
        </View>
      </View>
    </Modal>
  );
};

const Row = ({ icon, label, value, last }) => (
  <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
    <View style={styles.rowIcon}>
      <MaterialIcons name={icon} size={18} color={NAVY} />
    </View>
    <View style={{ flex: 1, marginLeft: 12 }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>{value}</Text>
    </View>
  </View>
);

export default ExpenseDetailScreen;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: {
    flex: 1, textAlign: 'center',
    color: '#fff', fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4,
    paddingHorizontal: 6,
  },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  descLabel: {
    fontSize: 10,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  descValue: {
    fontSize: 18,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
    marginTop: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  amountText: {
    fontSize: 22,
    color: ORANGE,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  statePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statePillText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  sectionTitle: {
    fontSize: 11, color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginLeft: 4, marginBottom: 6,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F6',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eef0f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowLabel: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rowValue: {
    fontSize: 14,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    marginTop: 2,
    letterSpacing: 0.2,
  },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 6,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    marginTop: 6,
  },
  lockedText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontFamily: FONT_FAMILY.urbanistMedium,
    lineHeight: 16,
  },

  // Duplicate-receipt yellow banner — same colour treatment Odoo uses
  // (light yellow bg, dark amber text + warning icon).
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 14,
  },
  duplicateBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontFamily: FONT_FAMILY.urbanistMedium,
    letterSpacing: 0.2,
  },

  // State stepper — Draft → Approved → Posted → Paid (+ Refused)
  stepperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  stepperPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPillText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  stepperActive: {
    backgroundColor: NAVY,
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  stepperActiveText: { color: '#fff' },
  stepperCompleted: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  stepperCompletedText: { color: NAVY },
  stepperPending: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  stepperPendingText: { color: MUTED },
  stepperRefusedActive: {
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#DC2626',
  },
  stepperRefusedActiveText: { color: '#fff' },
  stepperRefusedPending: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  stepperRefusedPendingText: { color: '#9F1239' },

  // Manager-action buttons (Approve / Refuse / Reset to Draft)
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#16A34A', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  refuseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 6,
    ...Platform.select({
      ios: { shadowColor: '#DC2626', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  refuseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  resetBtnText: {
    color: NAVY,
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  receiptRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderStyle: 'dashed',
  },
  attachBtnText: {
    color: NAVY,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: NAVY, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },
  viewBtnText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  // Receipt viewer modal — full-screen WebView/Image with prev/next nav
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
    backgroundColor: NAVY,
  },
  viewerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  viewerCounter: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginRight: 12,
  },
  viewerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBody: { flex: 1, backgroundColor: '#000' },
  viewerNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  viewerNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  viewerNavSpacer: { flex: 1 },
  viewerNavText: {
    color: NAVY,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  // Centred Download button — same orange CTA used elsewhere, sized to
  // sit comfortably between the Prev/Next arrows.
  viewerDownloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderRadius: 12,
    backgroundColor: ORANGE,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  viewerDownloadText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  viewerGenericBox: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  viewerGenericName: {
    fontSize: 16,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center',
    marginTop: 14,
  },
  viewerGenericMime: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 4,
    marginBottom: 18,
  },
  openInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 220,
    gap: 6,
  },
  openInBtnLarge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
    }),
  },
  // Pair the orange "Open / Play / View" CTA with a navy-outline
  // "Download" so the cashier can save the receipt to a folder
  // separately from opening it in the default app.
  viewerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    alignSelf: 'stretch',
    paddingHorizontal: 14,
  },
  downloadBtnLarge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  downloadBtnText: {
    color: NAVY,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  openInBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  // Audio receipt player
  audioBox: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  audioProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    marginTop: 18,
    overflow: 'hidden',
  },
  audioProgressFill: {
    height: '100%',
    backgroundColor: NAVY,
  },
  audioTime: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 16,
  },
  audioPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 12,
    minWidth: 160,
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: NAVY, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 6,
    ...Platform.select({
      ios: { shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  postBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  splitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  splitBtnText: {
    color: NAVY,
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },

  // Refuse-reason modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 2,
    borderColor: NAVY,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 8 },
    }),
  },
  modalTitle: {
    fontSize: 17,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    marginTop: 6,
    fontFamily: FONT_FAMILY.urbanistMedium,
    lineHeight: 18,
  },
  modalInput: {
    marginTop: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistMedium,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#DC2626', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
    }),
  },
  modalConfirmText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
