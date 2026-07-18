// Receipt Paper Sizes — the per-company editable list of paper sizes the shop
// prints on (pos.invoice.paper.size). Replaces the six hardcoded presets: sizes
// are now records you can add / edit / reorder / delete. The default receipt
// size (General Settings) links to one of these, and the print-time size popup
// reads them. Admin-only. The single per-company "Custom" record is shown but
// locked (managed by the module, not deletable here).
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, RefreshControl,
} from 'react-native';
import Modal from 'react-native-modal';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import {
  fetchPaperSizes, createPaperSize, updatePaperSize, deletePaperSize, reorderPaperSizes,
} from '@api/services/generalApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const ReceiptPaperSizesScreen = ({ navigation, route }) => {
  const authUser = useAuthStore((s) => s.user);
  const companyId = route?.params?.companyId ?? null;

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [confirmItem, setConfirmItem] = useState(null);
  // Edit/create form. `editing` = the record (or { isNew:true }); null = closed.
  const [editing, setEditing] = useState(null);
  // Size is entered as an inch NUMBER ("inch" is a static suffix); the width mm
  // auto-fills from it (like the module's name→width convenience). fOrigName
  // preserves a non-inch name (A5/A4/custom) when editing without retyping.
  const [fInches, setFInches] = useState('');
  const [fOrigName, setFOrigName] = useState('');
  const [fWidth, setFWidth] = useState('');
  const [fHeight, setFHeight] = useState('');

  useEffect(() => {
    const ok = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(ok);
    if (!ok) {
      showToastMessage('Only administrators can access Invoice Settings');
      setTimeout(() => navigation.goBack(), 1500);
    }
  }, [authUser, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPaperSizes(companyId);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      showToastMessage(e?.message || 'Failed to load sizes');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(useCallback(() => { if (isAdmin) load(); }, [isAdmin, load]));

  const openNew = () => {
    setFInches(''); setFOrigName(''); setFWidth(''); setFHeight('');
    setEditing({ isNew: true });
  };
  const openEdit = (item) => {
    // Pull a leading number out of the name ("8 inch" → "8"); non-inch names
    // (A5/A4/Custom) leave the inch field blank but keep the original name.
    const m = String(item.name || '').trim().match(/^(\d+(?:\.\d+)?)/);
    setFInches(m ? m[1] : '');
    setFOrigName(item.name || '');
    setFWidth(item.width_mm ? String(item.width_mm) : '');
    setFHeight(item.height_mm ? String(item.height_mm) : '');
    setEditing(item);
  };

  // Typing the inch number auto-fills the width (1 inch = 25.4 mm). Width stays
  // editable afterwards; only an inch change recomputes it.
  const onChangeInches = (t) => {
    const clean = t.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setFInches(clean);
    const n = parseFloat(clean);
    if (Number.isFinite(n) && n > 0) setFWidth(String(Math.round(n * 25.4)));
  };

  const onSave = async () => {
    const inches = parseFloat(fInches);
    const hasInches = Number.isFinite(inches) && inches > 0;
    // A number → "8 inch" / "3.5 inch"; otherwise keep an existing non-inch name.
    const name = hasInches ? `${inches} inch` : (fOrigName || '').trim();
    const width = parseInt(fWidth, 10);
    const height = parseInt(fHeight, 10) || 0;
    if (!name) { showToastMessage('Enter the size in inches'); return; }
    if (!Number.isFinite(width) || width <= 0) { showToastMessage('Enter a valid width in mm'); return; }
    setSaving(true);
    try {
      if (editing?.isNew) {
        // key is auto-slugged from name server-side on create.
        await createPaperSize({
          ...(companyId ? { company_id: companyId } : {}),
          name, width_mm: width, height_mm: height,
        });
        showToastMessage('Size added');
      } else {
        await updatePaperSize(editing.id, { name, width_mm: width, height_mm: height });
        showToastMessage('Size updated');
      }
      setEditing(null);
      load();
    } catch (e) {
      // Surface the server band/constraint message.
      showToastMessage(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmItem) return;
    setSaving(true);
    try {
      await deletePaperSize(confirmItem.id);
      showToastMessage('Deleted');
      setConfirmItem(null);
      load();
    } catch (e) {
      showToastMessage(e?.message || 'Delete failed (it may be in use as a default).');
    } finally {
      setSaving(false);
    }
  };

  // Move a row up/down and persist the new order.
  const move = async (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    const tmp = next[index]; next[index] = next[j]; next[j] = tmp;
    setRows(next);
    setReordering(true);
    try {
      await reorderPaperSizes(next.map((r) => r.id));
    } catch (e) {
      showToastMessage(e?.message || 'Reorder failed');
      load();
    } finally {
      setReordering(false);
    }
  };

  const sizeText = (item) => `${item.width_mm}${item.height_mm ? ` × ${item.height_mm}` : ''} mm${item.height_mm ? '' : ' (auto height)'}`;

  const renderItem = ({ item, index }) => (
    <View style={styles.row}>
      <View style={styles.reorderCol}>
        <TouchableOpacity disabled={reordering || index === 0} onPress={() => move(index, -1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <MaterialIcons name="keyboard-arrow-up" size={22} color={index === 0 ? '#d1d5db' : '#6b7280'} />
        </TouchableOpacity>
        <TouchableOpacity disabled={reordering || index === rows.length - 1} onPress={() => move(index, 1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <MaterialIcons name="keyboard-arrow-down" size={22} color={index === rows.length - 1 ? '#d1d5db' : '#6b7280'} />
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}{item.is_custom ? '  · Custom' : ''}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sizeText(item)}</Text>
      </View>
      {item.is_custom ? (
        <MaterialIcons name="lock-outline" size={18} color="#c7ccd6" style={{ marginRight: 6 }} />
      ) : (
        <>
          <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="edit" size={19} color={NAVY} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setConfirmItem(item)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="delete-outline" size={19} color="#dc2626" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="Receipt Paper Sizes" onBackPress={() => navigation.goBack()} />
        <View style={styles.center}><Text style={styles.muted}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Receipt Paper Sizes" onBackPress={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => `ps-${it.id}`}
          renderItem={renderItem}
          style={{ backgroundColor: '#fff' }}
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ORANGE} />}
          ListHeaderComponent={(
            <Text style={styles.hint}>
              Enter the size in inches (e.g. 8) — the width fills in automatically
              (1 inch = 25.4 mm) and can still be adjusted. Height 0 = one continuous
              page (auto). Each size gets its own layout under Invoice Layouts.
            </Text>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No sizes yet — tap “New”.</Text>}
        />
      )}

      {!loading ? (
        <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openNew}>
          <MaterialIcons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>New</Text>
        </TouchableOpacity>
      ) : null}

      {/* Add / edit size */}
      <Modal
        isVisible={!!editing}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.5}
        onBackButtonPress={() => setEditing(null)}
        onBackdropPress={() => setEditing(null)}
        style={styles.modalCenter}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{editing?.isNew ? 'New Paper Size' : 'Edit Paper Size'}</Text>

          <Text style={styles.label}>Size (inch)</Text>
          <View style={styles.inchRow}>
            <TextInput
              style={styles.inchInput} value={fInches}
              onChangeText={onChangeInches}
              keyboardType="numeric" maxLength={5}
              placeholder="e.g. 8" placeholderTextColor="#999"
            />
            <Text style={styles.inchSuffix}>inch</Text>
          </View>
          {fOrigName && !/^\d/.test(fOrigName.trim()) ? (
            <Text style={styles.subHint}>Editing “{fOrigName}”. Type a number to rename it as “N inch”.</Text>
          ) : null}

          <Text style={styles.label}>Width (mm) — auto from inch</Text>
          <TextInput
            style={styles.input} value={fWidth}
            onChangeText={(t) => setFWidth(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad" maxLength={4} placeholder="auto" placeholderTextColor="#999"
          />

          <Text style={styles.label}>Height (mm) — 0 = auto</Text>
          <TextInput
            style={styles.input} value={fHeight}
            onChangeText={(t) => setFHeight(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad" maxLength={4} placeholder="0 (continuous roll)" placeholderTextColor="#999"
          />

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setEditing(null)} disabled={saving}>
              <Text style={[styles.modalBtnText, { color: '#374151' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={onSave} disabled={saving}>
              <Text style={styles.modalBtnText}>{saving ? '…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete confirm */}
      <Modal
        isVisible={!!confirmItem}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.6}
        onBackButtonPress={() => setConfirmItem(null)}
        onBackdropPress={() => setConfirmItem(null)}
      >
        <View style={styles.alertContainer}>
          <Text style={styles.alertText}>Delete “{confirmItem?.name}”?</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: '#e5e7eb', minWidth: 110 }]} onPress={() => setConfirmItem(null)}>
              <Text style={[styles.alertButtonText, { color: '#111827' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: '#dc2626', minWidth: 110 }]} onPress={confirmDelete} disabled={saving}>
              <Text style={styles.alertButtonText}>{saving ? '…' : 'Delete'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  muted: { color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium },
  hint: { fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 10, lineHeight: 17 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 30, fontFamily: FONT_FAMILY.urbanistMedium },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#eef0f4',
  },
  reorderCol: { marginRight: 8, alignItems: 'center' },
  rowTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  rowSub: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#9ca3af', marginTop: 2 },
  iconBtn: { padding: 6, marginLeft: 2 },
  fab: {
    position: 'absolute', right: 18, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ORANGE, borderRadius: 28, paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 2 },
  // Edit modal
  modalCenter: { margin: 24, justifyContent: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18 },
  modalTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827', marginBottom: 8 },
  label: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#374151', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, backgroundColor: '#fff',
  },
  inchRow: { flexDirection: 'row', alignItems: 'center' },
  inchInput: {
    flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold, backgroundColor: '#fff',
  },
  inchSuffix: { marginLeft: 10, fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#374151' },
  subHint: { fontSize: 11, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 4 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalBtn: { flex: 1, backgroundColor: NAVY, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: '#f1f5f9' },
  modalBtnText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14 },
  // Delete confirm
  alertContainer: {
    backgroundColor: '#fff', borderRadius: 10, borderColor: NAVY, borderWidth: 2,
    paddingVertical: 22, paddingHorizontal: 14, alignItems: 'center',
  },
  alertText: { marginVertical: 16, fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'center' },
  alertButton: { borderRadius: 10, padding: 14, justifyContent: 'center', alignItems: 'center' },
  alertButtonText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },
});

export default ReceiptPaperSizesScreen;
