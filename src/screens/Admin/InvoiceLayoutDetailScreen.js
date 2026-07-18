// Invoice Layout detail (native mirror of the Odoo layout form — image 2). Shows
// the layout's info + its Blocks list (with quick visible toggle + reorder), a
// print-exact Preview, and buttons: Open Visual Editor, Add section, Reset to
// Default. Admin-only. Tap a size on InvoiceLayoutsScreen to get here.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Switch,
} from 'react-native';
import Modal from 'react-native-modal';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import {
  fetchLayoutDetail, fetchLayoutBlocks, updateLayoutBlock, reorderLayoutBlocks,
  createLayoutBlock, resetLayoutDefault, fetchLayoutPreviewHtml,
} from '@api/services/generalApi';
import { BLOCK_TYPE_LABELS, ADDABLE_BLOCK_TYPES } from './layoutBlockMeta';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const InvoiceLayoutDetailScreen = ({ navigation, route }) => {
  const authUser = useAuthStore((s) => s.user);
  const layoutId = route?.params?.layoutId;
  const title = route?.params?.title || 'Layout';

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [busy, setBusy] = useState(false);
  // Modals
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editorPromptOpen, setEditorPromptOpen] = useState(false);

  useEffect(() => {
    const ok = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(ok);
    if (!ok) {
      showToastMessage('Only administrators can access Invoice Settings');
      setTimeout(() => navigation.goBack(), 1500);
    }
  }, [authUser, navigation]);

  const load = useCallback(async () => {
    if (!layoutId) return;
    setLoading(true);
    try {
      const [d, b] = await Promise.all([fetchLayoutDetail(layoutId), fetchLayoutBlocks(layoutId)]);
      setDetail(d);
      setBlocks(Array.isArray(b) ? b : []);
    } catch (e) {
      showToastMessage(e?.message || 'Failed to load layout');
    } finally {
      setLoading(false);
    }
  }, [layoutId]);

  useFocusEffect(useCallback(() => { if (isAdmin) load(); }, [isAdmin, load]));

  const toggleVisible = async (blk) => {
    setBlocks((prev) => prev.map((x) => (x.id === blk.id ? { ...x, visible: !x.visible } : x)));
    try { await updateLayoutBlock(blk.id, { visible: !blk.visible }); }
    catch (e) { showToastMessage(e?.message || 'Update failed'); load(); }
  };

  const move = async (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    const t = next[index]; next[index] = next[j]; next[j] = t;
    setBlocks(next);
    setBusy(true);
    try { await reorderLayoutBlocks(next.map((x) => x.id)); }
    catch (e) { showToastMessage(e?.message || 'Reorder failed'); load(); }
    finally { setBusy(false); }
  };

  const openPreview = async () => {
    setPreviewHtml(''); setPreviewOpen(true); setPreviewLoading(true);
    try {
      const html = await fetchLayoutPreviewHtml(layoutId);
      if (!html) { showToastMessage('No preview yet — make a sale first.'); setPreviewOpen(false); return; }
      setPreviewHtml(html);
    } catch (e) { showToastMessage(e?.message || 'Preview failed'); setPreviewOpen(false); }
    finally { setPreviewLoading(false); }
  };

  const addSection = async (type) => {
    setAddOpen(false);
    setBusy(true);
    try {
      const nextRow = blocks.reduce((m, b) => Math.max(m, b.row || 0), -1) + 1;
      const nextY = blocks.reduce((m, b) => Math.max(m, (b.grid_y || 0) + (b.grid_h || 0)), 0);
      await createLayoutBlock({
        layout_id: Number(layoutId), block_type: type, row: nextRow, col: 0,
        width_pct: 100, visible: true, grid_x: 0, grid_y: nextY,
        grid_w: Math.round((detail?.widthMm || 80) / 10), grid_h: 2,
      });
      showToastMessage('Section added');
      load();
    } catch (e) { showToastMessage(e?.message || 'Add failed'); }
    finally { setBusy(false); }
  };

  const doReset = async () => {
    setResetOpen(false);
    setBusy(true);
    try { await resetLayoutDefault(layoutId); showToastMessage('Reset to default'); load(); }
    catch (e) { showToastMessage(e?.message || 'Reset failed'); }
    finally { setBusy(false); }
  };

  const openEditor = () => {
    setEditorPromptOpen(false);
    navigation.navigate('InvoiceLayoutEditor', {
      layoutId, title, widthMm: detail?.widthMm || 80, positioning: detail?.positioning || 'flow',
    });
  };

  const renderBlock = ({ item, index }) => (
    <View style={styles.blockRow}>
      <View style={styles.reorderCol}>
        <TouchableOpacity disabled={busy || index === 0} onPress={() => move(index, -1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <MaterialIcons name="keyboard-arrow-up" size={22} color={index === 0 ? '#d1d5db' : '#6b7280'} />
        </TouchableOpacity>
        <TouchableOpacity disabled={busy || index === blocks.length - 1} onPress={() => move(index, 1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <MaterialIcons name="keyboard-arrow-down" size={22} color={index === blocks.length - 1 ? '#d1d5db' : '#6b7280'} />
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.blockName, !item.visible && { color: '#9ca3af' }]}>{BLOCK_TYPE_LABELS[item.block_type] || item.block_type}</Text>
        <Text style={styles.blockSub}>Row {item.row} · {item.width_pct}% · {item.align}</Text>
      </View>
      <Switch value={!!item.visible} onValueChange={() => toggleVisible(item)} trackColor={{ true: ORANGE }} />
    </View>
  );

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title={title} onBackPress={() => navigation.goBack()} />
        <View style={styles.center}><Text style={styles.muted}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title={title} onBackPress={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(it) => `blk-${it.id}`}
          renderItem={renderBlock}
          style={{ backgroundColor: '#fff' }}
          contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ORANGE} />}
          ListHeaderComponent={(
            <>
              <View style={styles.infoCard}>
                <InfoRow label="Name" value={detail?.name} />
                <InfoRow label="Paper Size" value={detail?.paper_size_label} />
                <InfoRow label="Base Style" value={detail?.base_style_label} />
                <InfoRow label="Positioning" value={detail?.positioning === 'grid' ? 'Grid' : 'Flow'} />
                <InfoRow label="Company" value={Array.isArray(detail?.company_id) ? detail.company_id[1] : ''} />
              </View>
              <TouchableOpacity style={styles.editorBtn} activeOpacity={0.85} onPress={() => setEditorPromptOpen(true)}>
                <MaterialIcons name="dashboard-customize" size={20} color="#fff" />
                <Text style={styles.editorBtnText}>Open Visual Editor</Text>
              </TouchableOpacity>
              <View style={styles.actionRow}>
                <ActionBtn icon="visibility" label="Preview" onPress={openPreview} />
                <ActionBtn icon="add" label="Add section" onPress={() => setAddOpen(true)} />
                <ActionBtn icon="restore" label="Reset" color="#dc2626" onPress={() => setResetOpen(true)} />
              </View>
              <Text style={styles.sectionLabel}>Blocks</Text>
            </>
          )}
        />
      )}

      {/* Preview */}
      <Modal isVisible={previewOpen} style={styles.previewModal} onBackButtonPress={() => setPreviewOpen(false)} onBackdropPress={() => setPreviewOpen(false)} backdropOpacity={0.5}>
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>Preview — {title}</Text>
            <TouchableOpacity onPress={() => setPreviewOpen(false)} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          {previewLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
          ) : (
            <WebView originWhitelist={['*']} source={{ html: previewHtml }} style={{ flex: 1 }} scalesPageToFit />
          )}
        </View>
      </Modal>

      {/* Add section */}
      <Modal isVisible={addOpen} style={styles.modalCenter} onBackButtonPress={() => setAddOpen(false)} onBackdropPress={() => setAddOpen(false)}>
        <View style={styles.pickerCard}>
          <Text style={styles.modalTitle}>Add section</Text>
          <FlatList
            data={ADDABLE_BLOCK_TYPES}
            keyExtractor={(t) => t}
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerRow} onPress={() => addSection(item)}>
                <Text style={styles.pickerRowText}>{BLOCK_TYPE_LABELS[item]}</Text>
                <MaterialIcons name="add" size={20} color={ORANGE} />
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Open Visual Editor — landscape info popup */}
      <Modal isVisible={editorPromptOpen} style={styles.modalCenter} onBackButtonPress={() => setEditorPromptOpen(false)} onBackdropPress={() => setEditorPromptOpen(false)}>
        <View style={styles.editorPromptCard}>
          <MaterialIcons name="screen-rotation" size={34} color={ORANGE} />
          <Text style={styles.editorPromptTitle}>Visual Editor</Text>
          <Text style={styles.editorPromptText}>
            Opens in landscape with three panels — Design (blocks) on the left,
            Options in the middle, and a Live Preview on the right, just like the web.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: '#e5e7eb', minWidth: 110 }]} onPress={() => setEditorPromptOpen(false)}>
              <Text style={[styles.alertButtonText, { color: '#111827' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: NAVY, minWidth: 110 }]} onPress={openEditor}>
              <Text style={styles.alertButtonText}>Open</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reset confirm */}
      <Modal isVisible={resetOpen} onBackButtonPress={() => setResetOpen(false)} onBackdropPress={() => setResetOpen(false)}>
        <View style={styles.alertContainer}>
          <Text style={styles.alertText}>Reset this layout to the default blocks? Your changes to it will be lost.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: '#e5e7eb', minWidth: 110 }]} onPress={() => setResetOpen(false)}>
              <Text style={[styles.alertButtonText, { color: '#111827' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: '#dc2626', minWidth: 110 }]} onPress={doReset}>
              <Text style={styles.alertButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={1}>{value || '—'}</Text>
  </View>
);

const ActionBtn = ({ icon, label, onPress, color }) => (
  <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8} onPress={onPress}>
    <MaterialIcons name={icon} size={20} color={color || NAVY} />
    <Text style={[styles.actionBtnText, color ? { color } : null]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', minHeight: 120 },
  muted: { color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium },
  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#eef0f4', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  infoLabel: { fontSize: 13, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium },
  infoValue: { fontSize: 13, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold, maxWidth: '60%' },
  editorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: NAVY, borderRadius: 12, paddingVertical: 14, marginBottom: 10,
  },
  editorBtnText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 15 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  actionBtn: {
    flex: 1, alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 10,
    paddingVertical: 12, borderWidth: 1, borderColor: '#eef0f4',
  },
  actionBtnText: { fontSize: 12, color: NAVY, fontFamily: FONT_FAMILY.urbanistSemiBold },
  sectionLabel: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#374151', marginBottom: 8 },
  blockRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#eef0f4',
  },
  reorderCol: { marginRight: 8, alignItems: 'center' },
  blockName: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  blockSub: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#9ca3af', marginTop: 2 },
  // preview modal
  previewModal: { margin: 10 },
  previewCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginVertical: 30 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef0f4' },
  previewTitle: { flex: 1, fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  // pickers
  modalCenter: { margin: 24, justifyContent: 'center' },
  pickerCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  modalTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827', marginBottom: 8 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerRowText: { fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },
  alertContainer: { backgroundColor: '#fff', borderRadius: 10, borderColor: NAVY, borderWidth: 2, paddingVertical: 22, paddingHorizontal: 14, alignItems: 'center' },
  alertText: { marginVertical: 14, fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'center' },
  alertButton: { borderRadius: 10, padding: 14, alignItems: 'center' },
  alertButtonText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },
  editorPromptCard: { backgroundColor: '#fff', borderRadius: 16, padding: 22, alignItems: 'center' },
  editorPromptTitle: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827', marginTop: 8 },
  editorPromptText: { fontSize: 13, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistMedium, textAlign: 'center', marginTop: 8, lineHeight: 19 },
});

export default InvoiceLayoutDetailScreen;
