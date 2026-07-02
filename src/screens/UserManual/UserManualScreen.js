// User Manual documents screen. Everyone (when the manual is enabled) can
// open this to VIEW or DOWNLOAD any manual PDF stored in the Odoo DB
// (app_user_manual module). Admins additionally get Add / Replace / Delete
// controls to manage the library from the app — the same records the Odoo
// backend "User Manual" menu edits. Mirrors the look of InvoiceSettingsListScreen.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput,
} from 'react-native';
import Modal from 'react-native-modal';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import UserManualModal from '@components/UserManual/UserManualModal';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { openManualPdf, downloadManualPdf } from '@utils/userManual';
import {
  fetchUserManualList, saveUserManual, deleteUserManual,
} from '@api/services/generalApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const UserManualScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = !!(authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [notInstalled, setNotInstalled] = useState(false);

  // View/Download chooser (all users)
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Delete confirm (admin)
  const [confirmItem, setConfirmItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Add/Edit editor (admin)
  const [editorVisible, setEditorVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [pickedName, setPickedName] = useState('');   // new file's display name
  const [pickedBase64, setPickedBase64] = useState(null);
  const [existingFilename, setExistingFilename] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchUserManualList();
      if (list === null) { setNotInstalled(true); setRows([]); return; }
      setNotInstalled(false);
      setRows(list);
    } catch (e) {
      showToastMessage(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // --- View / Download -------------------------------------------------------
  const runAction = async (fn) => {
    const doc = selectedDoc;
    setActionBusy(true);
    try { await fn(doc); } finally {
      setActionBusy(false);
      setSelectedDoc(null);
    }
  };

  // --- Admin: add / edit -----------------------------------------------------
  const openAdd = () => {
    setEditId(null);
    setEditName('');
    setPickedName('');
    setPickedBase64(null);
    setExistingFilename('');
    setEditorVisible(true);
  };

  const openEdit = (item) => {
    setEditId(item.id);
    setEditName(item.name || '');
    setPickedName('');
    setPickedBase64(null);
    setExistingFilename(item.filename || '');
    setEditorVisible(true);
  };

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf', copyToCacheDirectory: true, multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets && res.assets[0];
      if (!asset?.uri) { showToastMessage('Could not read the selected file'); return; }
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setPickedBase64(base64);
      setPickedName(asset.name || 'document.pdf');
      // Default the title to the file name (sans extension) when adding new.
      if (!editId && !editName) {
        setEditName((asset.name || 'User Manual').replace(/\.pdf$/i, ''));
      }
    } catch (e) {
      console.error('[UserManual] pickPdf', e);
      showToastMessage('Failed to pick file');
    }
  };

  const onSaveEditor = async () => {
    if (!editName.trim()) { showToastMessage('Please enter a title'); return; }
    if (!editId && !pickedBase64) { showToastMessage('Please choose a PDF file'); return; }
    setSaving(true);
    try {
      await saveUserManual({
        id: editId,
        name: editName.trim(),
        // Only send file fields when a new file was picked.
        ...(pickedBase64 ? { base64: pickedBase64, filename: pickedName } : {}),
      });
      showToastMessage('Saved');
      setEditorVisible(false);
      load();
    } catch (e) {
      console.error('[UserManual] save', e);
      showToastMessage(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // --- Admin: delete ---------------------------------------------------------
  const confirmDelete = async () => {
    if (!confirmItem) return;
    setDeleting(true);
    try {
      await deleteUserManual(confirmItem.id);
      showToastMessage('Deleted');
      setConfirmItem(null);
      load();
    } catch (e) {
      showToastMessage(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => setSelectedDoc(item)}>
      <View style={styles.rowIcon}>
        <MaterialIcons name="picture-as-pdf" size={22} color="#D32F2F" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{item.filename || 'PDF document'}</Text>
      </View>
      {isAdmin ? (
        <>
          <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="edit" size={20} color={NAVY} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setConfirmItem(item)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
          </TouchableOpacity>
        </>
      ) : null}
      <MaterialIcons name="chevron-right" size={22} color="#c7ccd6" />
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.center}>
      <MaterialIcons name="menu-book" size={44} color="#c7ccd6" />
      <Text style={styles.emptyText}>
        {notInstalled
          ? 'The manual feature is not set up on this server yet.'
          : (isAdmin ? 'No documents yet. Tap “Add” to upload one.' : 'No manual documents available yet.')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="User Manual" onBackPress={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => `manual-${it.id}`}
          renderItem={renderItem}
          style={{ backgroundColor: '#fff' }}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ORANGE} />}
          ListEmptyComponent={<EmptyState />}
        />
      )}

      {isAdmin && !loading && !notInstalled ? (
        <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openAdd}>
          <MaterialIcons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>Add</Text>
        </TouchableOpacity>
      ) : null}

      {/* View / Download chooser for a tapped document */}
      <UserManualModal
        visible={!!selectedDoc}
        busy={actionBusy}
        onView={() => runAction(openManualPdf)}
        onDownload={() => runAction(downloadManualPdf)}
        onClose={() => setSelectedDoc(null)}
      />

      {/* Add / Edit editor (admin) */}
      <Modal
        isVisible={editorVisible}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.6}
        onBackButtonPress={() => setEditorVisible(false)}
        onBackdropPress={() => setEditorVisible(false)}
        avoidKeyboard
      >
        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>{editId ? 'Edit Document' : 'Add Document'}</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={editName}
            onChangeText={setEditName}
            placeholder="e.g. Getting Started Guide"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>PDF file</Text>
          <TouchableOpacity style={styles.pickBtn} onPress={pickPdf} activeOpacity={0.85}>
            <MaterialIcons name="upload-file" size={18} color="#fff" />
            <Text style={styles.pickBtnText}>{editId ? 'Replace PDF' : 'Choose PDF'}</Text>
          </TouchableOpacity>
          <Text style={styles.fileHint} numberOfLines={1}>
            {pickedName
              ? `Selected: ${pickedName}`
              : (editId ? `Current: ${existingFilename || 'keep existing file'}` : 'No file chosen')}
          </Text>

          <View style={styles.editorRow}>
            <TouchableOpacity style={[styles.editorBtn, styles.editorGhost]} onPress={() => setEditorVisible(false)} disabled={saving}>
              <Text style={[styles.editorBtnText, { color: '#6B7280' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.editorBtn, styles.editorConfirm, saving && { opacity: 0.6 }]} onPress={onSaveEditor} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.editorBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete confirm (admin) */}
      <Modal
        isVisible={!!confirmItem}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.7}
        onBackButtonPress={() => setConfirmItem(null)}
        onBackdropPress={() => setConfirmItem(null)}
      >
        <View style={styles.alertContainer}>
          <Text style={styles.alertText}>Delete “{confirmItem?.name}”?</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.alertButton, { flex: 1 }]} disabled={deleting} onPress={confirmDelete}>
              <Text style={styles.alertButtonText}>{deleting ? '...' : 'YES'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.alertButton, { flex: 1 }]} disabled={deleting} onPress={() => setConfirmItem(null)}>
              <Text style={styles.alertButtonText}>NO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  emptyText: { marginTop: 12, color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium, textAlign: 'center', fontSize: 13 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eef0f4',
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDECEA',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  rowSub: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#9ca3af', marginTop: 2 },
  iconBtn: { padding: 4, marginRight: 4 },
  fab: {
    position: 'absolute', right: 18, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ORANGE, borderRadius: 28, paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 2 },
  // Editor
  editorCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  editorTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY, marginBottom: 8 },
  label: { fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, backgroundColor: '#fff',
  },
  pickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: NAVY, borderRadius: 10, paddingVertical: 11,
  },
  pickBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },
  fileHint: { fontSize: 11, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 6 },
  editorRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  editorBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editorGhost: { borderWidth: 1.5, borderColor: '#E2E6EC' },
  editorConfirm: { backgroundColor: ORANGE },
  editorBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },
  // Delete confirm
  alertContainer: {
    backgroundColor: '#fff', borderRadius: 10, borderColor: NAVY, borderWidth: 2,
    paddingVertical: 22, paddingHorizontal: 10, alignItems: 'center',
  },
  alertText: { marginVertical: 18, fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  alertButton: {
    backgroundColor: NAVY, borderRadius: 10, padding: 15,
    justifyContent: 'center', alignItems: 'center', marginHorizontal: 5,
  },
  alertButtonText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },
});

export default UserManualScreen;
