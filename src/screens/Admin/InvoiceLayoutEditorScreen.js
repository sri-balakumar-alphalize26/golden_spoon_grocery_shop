// Native Invoice Layout visual editor (image 3 functionality). Reproduces the
// Odoo OWL editor's options natively: live preview, block list (select/reorder/
// visible/delete), a per-block Options sheet with every control (align,
// direction, width %, grid X/Y/W/H, font size, bold, labels, custom text, logo
// width, QR, barcode, items-table line toggles), the shared Company Header
// editor, List<->Grid, Add section, Reset. Every edit auto-saves via the same
// server calls the web editor makes, then refreshes the preview.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch,
} from 'react-native';
import Modal from 'react-native-modal';
import { WebView } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import {
  fetchLayoutDetail, fetchLayoutBlocks, updateLayoutBlock, deleteLayoutBlock,
  reorderLayoutBlocks, createLayoutBlock, setLayoutPositioning, resetLayoutDefault,
  fetchLayoutPreviewHtml, fetchHeaderSettings, setHeaderSetting, fetchHeaderFields,
  addHeaderField, writeHeaderField, moveHeaderField, delHeaderField,
} from '@api/services/generalApi';
import {
  BLOCK_TYPE_LABELS, ADDABLE_BLOCK_TYPES, ALIGN_OPTIONS, DIRECTION_OPTIONS, BARCODE_FIELD_OPTIONS,
} from './layoutBlockMeta';
import { lockLandscape, lockPortrait } from '@utils/orientation';
import LayoutGridCanvas from './LayoutGridCanvas';

const HIT = { top: 6, bottom: 6, left: 6, right: 6 };

// Block fields captured for Undo/Redo snapshots (mirrors the editor's history).
const SNAP_FIELDS = [
  'row', 'col', 'width_pct', 'visible', 'align', 'direction', 'font_size_px', 'bold',
  'label_en', 'label_ar', 'content_en', 'content_ar', 'logo_width_pct', 'qr_data',
  'barcode_field', 'grid_x', 'grid_y', 'grid_w', 'grid_h',
  'show_line_meta', 'show_line_properties', 'show_line_tags',
];

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const InvoiceLayoutEditorScreen = ({ navigation, route }) => {
  const authUser = useAuthStore((s) => s.user);
  const layoutId = route?.params?.layoutId;
  const title = route?.params?.title || 'Layout';

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [positioning, setPositioning] = useState('flow');
  const [busy, setBusy] = useState(false);

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [selected, setSelected] = useState(null); // block being edited
  const [addOpen, setAddOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Company header (company-wide) — loaded when editing a header block.
  const [headerScalars, setHeaderScalars] = useState({});
  const [headerFields, setHeaderFields] = useState([]);

  const previewTimer = useRef(null);

  useEffect(() => {
    const ok = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(ok);
    if (!ok) { showToastMessage('Only administrators can access Invoice Settings'); setTimeout(() => navigation.goBack(), 1500); }
  }, [authUser, navigation]);

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true);
    try { setPreviewHtml(await fetchLayoutPreviewHtml(layoutId)); }
    catch (_) {} finally { setPreviewLoading(false); }
  }, [layoutId]);

  // Debounced preview refresh so rapid edits don't spam the server.
  const schedulePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(refreshPreview, 500);
  }, [refreshPreview]);

  const load = useCallback(async () => {
    if (!layoutId) return;
    setLoading(true);
    try {
      const [d, b] = await Promise.all([fetchLayoutDetail(layoutId), fetchLayoutBlocks(layoutId)]);
      setDetail(d);
      setPositioning(d?.positioning || 'flow');
      setBlocks(Array.isArray(b) ? b : []);
      refreshPreview();
    } catch (e) { showToastMessage(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [layoutId, refreshPreview]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);

  // Match the web editor: rotate to landscape for the 3-panel view, restore
  // portrait on the way out.
  useEffect(() => {
    lockLandscape();
    return () => { lockPortrait(); };
  }, []);

  // --- Undo / Redo: client-side block snapshots, like the OWL editor ---
  const snapshot = () => {
    const m = {};
    for (const b of blocks) { const o = {}; for (const f of SNAP_FIELDS) o[f] = b[f]; m[b.id] = o; }
    return m;
  };
  const pushHistory = () => { setUndoStack((s) => [...s.slice(-59), snapshot()]); setRedoStack([]); };
  const applySnapshot = async (snap) => {
    setBusy(true);
    try {
      for (const idStr of Object.keys(snap)) {
        const id = Number(idStr);
        const cur = blocks.find((b) => b.id === id);
        if (!cur) continue;
        const changed = {};
        for (const f of SNAP_FIELDS) if (cur[f] !== snap[idStr][f]) changed[f] = snap[idStr][f];
        if (Object.keys(changed).length) await updateLayoutBlock(id, changed);
      }
      await load();
    } catch (e) { showToastMessage(e?.message || 'Undo failed'); }
    finally { setBusy(false); }
  };
  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, snapshot()]);
    applySnapshot(prev);
  };
  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [...s, snapshot()]);
    applySnapshot(next);
  };
  // Everything already auto-saves; Save just confirms + refreshes (like the web).
  const onSave = async () => { await refreshPreview(); showToastMessage('Saved'); };

  // Write one block field, optimistic + persist + preview. Keeps `selected` in sync.
  const setField = async (block, field, value) => {
    pushHistory();
    setBlocks((prev) => prev.map((x) => (x.id === block.id ? { ...x, [field]: value } : x)));
    setSelected((s) => (s && s.id === block.id ? { ...s, [field]: value } : s));
    try { await updateLayoutBlock(block.id, { [field]: value }); schedulePreview(); }
    catch (e) { showToastMessage(e?.message || 'Update failed'); load(); }
  };

  // Commit a grid move/resize (called on gesture release from the canvas).
  const commitGrid = async (id, vals) => {
    pushHistory();
    setBlocks((prev) => prev.map((x) => (x.id === id ? { ...x, ...vals } : x)));
    setSelected((s) => (s && s.id === id ? { ...s, ...vals } : s));
    try { await updateLayoutBlock(id, vals); schedulePreview(); }
    catch (e) { showToastMessage(e?.message || 'Update failed'); load(); }
  };
  const onCommitMove = (id, gx, gy) => commitGrid(id, { grid_x: gx, grid_y: gy });
  const onCommitResize = (id, gw, gh) => commitGrid(id, { grid_w: gw, grid_h: gh });
  const selectById = (id) => { const b = blocks.find((x) => x.id === id); if (b) openOptions(b); };

  const move = async (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    const t = next[index]; next[index] = next[j]; next[j] = t;
    setBlocks(next); setBusy(true);
    try { await reorderLayoutBlocks(next.map((x) => x.id)); schedulePreview(); }
    catch (e) { showToastMessage(e?.message || 'Reorder failed'); load(); }
    finally { setBusy(false); }
  };

  const addSection = async (type) => {
    setAddOpen(false); setBusy(true);
    try {
      const nextRow = blocks.reduce((m, b) => Math.max(m, b.row || 0), -1) + 1;
      const nextY = blocks.reduce((m, b) => Math.max(m, (b.grid_y || 0) + (b.grid_h || 0)), 0);
      await createLayoutBlock({
        layout_id: Number(layoutId), block_type: type, row: nextRow, col: 0, width_pct: 100,
        visible: true, grid_x: 0, grid_y: nextY, grid_w: Math.round((detail?.widthMm || 80) / 10), grid_h: 2,
      });
      await load();
    } catch (e) { showToastMessage(e?.message || 'Add failed'); }
    finally { setBusy(false); }
  };

  const removeBlock = async (block) => {
    setSelected(null); setBusy(true);
    try { await deleteLayoutBlock(block.id); await load(); showToastMessage('Section deleted'); }
    catch (e) { showToastMessage(e?.message || 'Delete failed'); }
    finally { setBusy(false); }
  };

  const toggleMode = async () => {
    const mode = positioning === 'grid' ? 'flow' : 'grid';
    setBusy(true);
    try { await setLayoutPositioning(layoutId, mode); setPositioning(mode); await load(); }
    catch (e) { showToastMessage(e?.message || 'Switch failed'); }
    finally { setBusy(false); }
  };

  const doReset = async () => {
    pushHistory();
    setBusy(true);
    try { await resetLayoutDefault(layoutId); setSelected(null); await load(); showToastMessage('Reset to default'); }
    catch (e) { showToastMessage(e?.message || 'Reset failed'); }
    finally { setBusy(false); }
  };

  // Open the options sheet for a block; lazy-load company header data if needed.
  const openOptions = async (block) => {
    setSelected(block);
    if (block.block_type === 'company_name_en' || block.block_type === 'company_name_ar' || block.block_type === 'header_info') {
      try {
        if (block.block_type === 'header_info') setHeaderFields(await fetchHeaderFields(layoutId) || []);
        else setHeaderScalars(await fetchHeaderSettings(layoutId) || {});
      } catch (_) {}
    }
  };

  // --- Company header actions ---
  const saveHeaderScalar = async (field, value) => {
    setHeaderScalars((s) => ({ ...s, [field]: value }));
    try { await setHeaderSetting(layoutId, field, value); schedulePreview(); }
    catch (e) { showToastMessage(e?.message || 'Save failed'); }
  };
  const hfReload = async () => { try { setHeaderFields(await fetchHeaderFields(layoutId) || []); } catch (_) {} };
  const hfAdd = async () => { try { await addHeaderField(layoutId); await hfReload(); schedulePreview(); } catch (e) { showToastMessage(e?.message || 'Add failed'); } };
  const hfWrite = async (fid, vals) => {
    setHeaderFields((rows) => rows.map((r) => (r.id === fid ? { ...r, ...vals } : r)));
    try { await writeHeaderField(layoutId, fid, vals); schedulePreview(); } catch (e) { showToastMessage(e?.message || 'Save failed'); }
  };
  const hfMove = async (fid, dir) => { try { await moveHeaderField(layoutId, fid, dir); await hfReload(); schedulePreview(); } catch (e) { showToastMessage(e?.message || 'Move failed'); } };
  const hfDel = async (fid) => { try { await delHeaderField(layoutId, fid); await hfReload(); schedulePreview(); } catch (e) { showToastMessage(e?.message || 'Delete failed'); } };

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title={title} onBackPress={() => navigation.goBack()} />
        <View style={styles.center}><Text style={styles.muted}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  const isGrid = positioning === 'grid';
  const widthMm = route?.params?.widthMm || detail?.widthMm || 80;
  const previewNode = previewLoading
    ? <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>
    : <WebView originWhitelist={['*']} source={{ html: previewHtml }} style={{ flex: 1, backgroundColor: '#fff' }} scalesPageToFit />;

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title={`Editor — ${title}`} onBackPress={() => navigation.goBack()} />

      {/* Toolbar (full width, like the web) */}
      <View style={styles.toolbar}>
        <View style={styles.sizeTag}>
          <MaterialIcons name="crop-free" size={14} color={NAVY} />
          <Text style={styles.sizeText} numberOfLines={1}>{title} — {widthMm} mm</Text>
        </View>
        <ToolBtn icon="save" label="Save" onPress={onSave} disabled={busy} />
        <ToolBtn icon="undo" label="Undo" onPress={undo} disabled={busy || !undoStack.length} />
        <ToolBtn icon="redo" label="Redo" onPress={redo} disabled={busy || !redoStack.length} />
        <ToolBtn icon={isGrid ? 'view-agenda' : 'grid-view'} label={isGrid ? 'List' : 'Grid'} onPress={toggleMode} disabled={busy} />
        <ToolBtn icon="add" label="Add" onPress={() => setAddOpen(true)} disabled={busy} />
        <ToolBtn icon="restore" label="Reset" color="#dc2626" onPress={doReset} disabled={busy} />
        <View style={styles.savedTag}>
          <MaterialIcons name="check-circle" size={13} color="#16a34a" />
          <Text style={styles.savedText}>auto-saved</Text>
        </View>
      </View>
      {isGrid ? (
        <View style={styles.gridWarn}>
          <MaterialIcons name="warning-amber" size={13} color="#92400e" />
          <Text style={styles.gridWarnText}>Grid = fixed positions; use List for print-exact.</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        // 3-panel like the web: Design (canvas in grid / list in flow) | Options (inline) | Live Preview.
        <View style={styles.panels}>
          <View style={[styles.panel, styles.panelLeft]}>
            <Text style={styles.panelTitle}>Design</Text>
            {isGrid ? (
              <LayoutGridCanvas
                blocks={blocks}
                widthMm={widthMm}
                selectedId={selected?.id || null}
                onSelect={selectById}
                onCommitMove={onCommitMove}
                onCommitResize={onCommitResize}
                onToggleVisible={(b) => setField(b, 'visible', !b.visible)}
                onDelete={(b) => removeBlock(b)}
              />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {blocks.map((b, index) => {
                  const active = selected && selected.id === b.id;
                  return (
                    <TouchableOpacity key={`blk-${b.id}`} style={[styles.blockRow, active && styles.blockRowActive]} activeOpacity={0.7} onPress={() => openOptions(b)}>
                      <View style={styles.reorderCol}>
                        <TouchableOpacity disabled={busy || index === 0} onPress={() => move(index, -1)} hitSlop={HIT}>
                          <MaterialIcons name="keyboard-arrow-up" size={20} color={index === 0 ? '#d1d5db' : '#6b7280'} />
                        </TouchableOpacity>
                        <TouchableOpacity disabled={busy || index === blocks.length - 1} onPress={() => move(index, 1)} hitSlop={HIT}>
                          <MaterialIcons name="keyboard-arrow-down" size={20} color={index === blocks.length - 1 ? '#d1d5db' : '#6b7280'} />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.blockName, !b.visible && { color: '#9ca3af' }]} numberOfLines={1}>{BLOCK_TYPE_LABELS[b.block_type] || b.block_type}</Text>
                        <Text style={styles.blockSub} numberOfLines={1}>{`${b.width_pct}% · ${b.align}`}</Text>
                      </View>
                      <Switch value={!!b.visible} onValueChange={() => setField(b, 'visible', !b.visible)} trackColor={{ true: ORANGE }} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
          {/* Options — inline (no popup), like the web's middle panel. */}
          <View style={[styles.panel, styles.panelCenter]}>
            <Text style={styles.panelTitle}>Options</Text>
            {selected ? (
              <BlockOptions
                block={selected} isGrid={isGrid}
                onField={(f, v) => setField(selected, f, v)}
                onDelete={() => removeBlock(selected)} onClose={() => setSelected(null)}
                headerScalars={headerScalars} onHeaderScalar={saveHeaderScalar}
                headerFields={headerFields} hf={{ add: hfAdd, write: hfWrite, move: hfMove, del: hfDel }}
              />
            ) : (
              <View style={styles.optPlaceholderBox}>
                <MaterialIcons name="touch-app" size={28} color="#c7ccd6" />
                <Text style={styles.optPlaceholder}>Tap a section to edit it.</Text>
              </View>
            )}
          </View>
          <View style={[styles.panel, styles.panelRight]}>
            <Text style={styles.panelTitle}>Live Preview</Text>
            <View style={styles.previewBox}>{previewNode}</View>
          </View>
        </View>
      )}

      {/* Add section */}
      <Modal isVisible={addOpen} style={styles.modalCenter} onBackButtonPress={() => setAddOpen(false)} onBackdropPress={() => setAddOpen(false)}>
        <View style={styles.pickerCard}>
          <Text style={styles.modalTitle}>Add section</Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {ADDABLE_BLOCK_TYPES.map((t) => (
              <TouchableOpacity key={t} style={styles.pickerRow} onPress={() => addSection(t)}>
                <Text style={styles.pickerRowText}>{BLOCK_TYPE_LABELS[t]}</Text>
                <MaterialIcons name="add" size={20} color={ORANGE} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Per-block Options — every control the web editor exposes, by block_type.
// ---------------------------------------------------------------------------
const BlockOptions = ({ block, isGrid, onField, onDelete, onClose, headerScalars, onHeaderScalar, headerFields, hf }) => {
  const t = block.block_type;
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{BLOCK_TYPE_LABELS[t] || t}</Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><MaterialIcons name="close" size={22} color="#374151" /></TouchableOpacity>
      </View>

      <ToggleRow label="Visible" value={!!block.visible} onValueChange={(v) => onField('visible', v)} />
      <Segmented label="Align" options={ALIGN_OPTIONS} value={block.align || 'auto'} onChange={(v) => onField('align', v)} />
      <Segmented label="Direction" options={DIRECTION_OPTIONS} value={block.direction || 'auto'} onChange={(v) => onField('direction', v)} />

      {isGrid ? (
        <>
          <Stepper label="X (cm)" value={block.grid_x || 0} min={0} max={100} step={0.25} onChange={(v) => onField('grid_x', v)} />
          <Stepper label="Y (cm)" value={block.grid_y || 0} min={0} max={200} step={0.25} onChange={(v) => onField('grid_y', v)} />
          <Stepper label="Width (cm)" value={block.grid_w || 0} min={0.25} max={100} step={0.25} onChange={(v) => onField('grid_w', v)} />
          <Stepper label="Height (cm)" value={block.grid_h || 0} min={0.25} max={100} step={0.25} onChange={(v) => onField('grid_h', v)} />
        </>
      ) : (
        <Stepper label="Width %" value={block.width_pct || 100} min={1} max={100} step={5} onChange={(v) => onField('width_pct', v)} />
      )}

      <Stepper label="Font size (0 = default)" value={block.font_size_px || 0} min={0} max={40} step={1} onChange={(v) => onField('font_size_px', v)} />
      <ToggleRow label="Bold" value={!!block.bold} onValueChange={(v) => onField('bold', v)} />
      <View style={styles.optRow}>
        <Text style={styles.optLabel}>Flip side</Text>
        <TouchableOpacity style={styles.flipBtn} onPress={() => onField('align', block.align === 'left' ? 'right' : 'left')}>
          <MaterialIcons name="swap-horiz" size={18} color={NAVY} />
          <Text style={styles.flipBtnText}>Flip</Text>
        </TouchableOpacity>
      </View>

      {/* Type-specific */}
      {(t === 'title' || t === 'totals') ? (
        <>
          <TextField label="Label (English)" value={block.label_en} onSave={(v) => onField('label_en', v)} />
          <TextField label="Label (Arabic)" value={block.label_ar} onSave={(v) => onField('label_ar', v)} rtl />
        </>
      ) : null}

      {t === 'custom_text' ? (
        <>
          <TextField label="Text (English)" value={block.content_en} onSave={(v) => onField('content_en', v)} multiline />
          <TextField label="Text (Arabic)" value={block.content_ar} onSave={(v) => onField('content_ar', v)} multiline rtl />
        </>
      ) : null}

      {t === 'logo' ? (
        <Stepper label="Logo width %" value={block.logo_width_pct || 45} min={5} max={100} step={5} onChange={(v) => onField('logo_width_pct', v)} />
      ) : null}

      {t === 'qrcode' ? (
        <TextField label="QR data (URL / text)" value={block.qr_data} onSave={(v) => onField('qr_data', v)} />
      ) : null}

      {t === 'barcode' ? (
        <Segmented label="Barcode encodes" options={BARCODE_FIELD_OPTIONS} value={block.barcode_field || 'name'} onChange={(v) => onField('barcode_field', v)} />
      ) : null}

      {(t === 'company_name_en' || t === 'company_name_ar') ? (
        <>
          <Text style={styles.shareNote}>Company-wide — shared by every layout.</Text>
          <TextField
            label={t === 'company_name_ar' ? 'Company Name (Arabic)' : 'Company Name (English)'}
            value={headerScalars[t] || ''}
            onSave={(v) => onHeaderScalar(t, v)}
            rtl={t === 'company_name_ar'}
          />
        </>
      ) : null}

      {t === 'header_info' ? (
        <View style={{ marginTop: 6 }}>
          <Text style={styles.shareNote}>Company Header rows — shared by every layout.</Text>
          {(headerFields || []).map((f, i) => (
            <View key={`hf-${f.id}`} style={styles.hfRow}>
              <View style={styles.reorderCol}>
                <TouchableOpacity disabled={i === 0} onPress={() => hf.move(f.id, 'up')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <MaterialIcons name="keyboard-arrow-up" size={20} color={i === 0 ? '#d1d5db' : '#6b7280'} />
                </TouchableOpacity>
                <TouchableOpacity disabled={i === headerFields.length - 1} onPress={() => hf.move(f.id, 'down')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={i === headerFields.length - 1 ? '#d1d5db' : '#6b7280'} />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <MiniInput placeholder="Label (EN)" value={f.label_en} onSave={(v) => hf.write(f.id, { label_en: v })} />
                <MiniInput placeholder="Label (AR)" value={f.label_ar} onSave={(v) => hf.write(f.id, { label_ar: v })} rtl />
                <MiniInput placeholder="Value" value={f.value} onSave={(v) => hf.write(f.id, { value: v })} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Switch value={!!f.visible} onValueChange={(v) => hf.write(f.id, { visible: v })} trackColor={{ true: ORANGE }} />
                <TouchableOpacity onPress={() => hf.del(f.id)} style={{ padding: 4, marginTop: 4 }}>
                  <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.hfAddBtn} onPress={hf.add}>
            <MaterialIcons name="add" size={18} color={NAVY} />
            <Text style={styles.hfAddText}>Add header row</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
};

// --- Small reusable controls ---
const ToolBtn = ({ icon, label, onPress, disabled, color }) => (
  <TouchableOpacity style={styles.toolBtn} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
    <MaterialIcons name={icon} size={20} color={disabled ? '#c7ccd6' : (color || NAVY)} />
    <Text style={[styles.toolBtnText, color ? { color } : null, disabled ? { color: '#c7ccd6' } : null]}>{label}</Text>
  </TouchableOpacity>
);

const ToggleRow = ({ label, value, onValueChange }) => (
  <View style={styles.optRow}>
    <Text style={styles.optLabel}>{label}</Text>
    <Switch value={value} onValueChange={onValueChange} trackColor={{ true: ORANGE }} />
  </View>
);

const Segmented = ({ label, options, value, onChange }) => (
  <View style={styles.optCol}>
    <Text style={styles.optLabel}>{label}</Text>
    <View style={styles.segment}>
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const lbl = typeof o === 'string' ? o : o.label;
        const active = value === val;
        return (
          <TouchableOpacity key={val} style={[styles.segItem, active && styles.segItemActive]} onPress={() => onChange(val)}>
            <Text style={[styles.segText, active && styles.segTextActive]}>{lbl}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const Stepper = ({ label, value, min, max, step, onChange }) => {
  const round = (v) => Math.round(v * 100) / 100;
  const clamp = (v) => Math.max(min, Math.min(max, round(v)));
  return (
    <View style={styles.optRow}>
      <Text style={styles.optLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(clamp(Number(value) - step))}>
          <MaterialIcons name="remove" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.stepVal}>{round(Number(value) || 0)}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(clamp(Number(value) + step))}>
          <MaterialIcons name="add" size={18} color={NAVY} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Text field that commits on blur / end editing (avoids a write per keystroke).
const TextField = ({ label, value, onSave, multiline, rtl }) => {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <View style={styles.optCol}>
      <Text style={styles.optLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 70, textAlignVertical: 'top' }, rtl && { textAlign: 'right' }]}
        value={v} onChangeText={setV} onEndEditing={() => onSave(v)} onBlur={() => onSave(v)}
        multiline={!!multiline} placeholderTextColor="#999"
      />
    </View>
  );
};

const MiniInput = ({ placeholder, value, onSave, rtl }) => {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <TextInput
      style={[styles.miniInput, rtl && { textAlign: 'right' }]}
      value={v} onChangeText={setV} onEndEditing={() => onSave(v)} onBlur={() => onSave(v)}
      placeholder={placeholder} placeholderTextColor="#9ca3af"
    />
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', minHeight: 120 },
  muted: { color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium },
  toolbar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef0f4', paddingVertical: 8, paddingHorizontal: 6 },
  toolBtn: { flex: 1, alignItems: 'center', gap: 2 },
  toolBtnText: { fontSize: 11, color: NAVY, fontFamily: FONT_FAMILY.urbanistSemiBold },
  savedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8 },
  savedText: { fontSize: 11, color: '#16a34a', fontFamily: FONT_FAMILY.urbanistSemiBold },
  sizeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, maxWidth: 150 },
  sizeText: { fontSize: 12, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold },
  gridWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff7ed', borderBottomWidth: 1, borderBottomColor: '#fed7aa', paddingHorizontal: 12, paddingVertical: 5 },
  gridWarnText: { fontSize: 11, color: '#92400e', fontFamily: FONT_FAMILY.urbanistMedium },
  gridCanvasPanel: { flex: 0.62 },
  gridPreviewPanel: { flex: 0.38, borderRightWidth: 0 },
  // 3-panel landscape body (Design | Options | Live Preview), like the web.
  panels: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },
  panel: { borderRightWidth: 1, borderRightColor: '#eef0f4', padding: 10, overflow: 'hidden' },
  panelLeft: { flex: 0.34 },
  panelCenter: { flex: 0.30 },
  panelRight: { flex: 0.36, borderRightWidth: 0 },
  panelTitle: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#6b7280', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  optPlaceholderBox: { alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 8 },
  optPlaceholder: { color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, fontSize: 13, textAlign: 'center' },
  blockRowActive: { borderColor: ORANGE, borderWidth: 1.5 },
  previewBox: { flex: 1, borderWidth: 1, borderColor: '#eef0f4', borderRadius: 8, overflow: 'hidden' },
  gridNote: { fontSize: 12, color: '#92400e', backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12, fontFamily: FONT_FAMILY.urbanistMedium },
  sectionLabel: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#374151', marginBottom: 8 },
  blockRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#eef0f4' },
  reorderCol: { marginRight: 6, alignItems: 'center' },
  blockName: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  blockSub: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistMedium, color: '#9ca3af', marginTop: 2 },
  // sheet
  sheet: { justifyContent: 'flex-end', margin: 0 },
  sheetCard: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  optCol: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  optLabel: { fontSize: 13, color: '#374151', fontFamily: FONT_FAMILY.urbanistSemiBold },
  flipBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f9fafb' },
  flipBtnText: { fontSize: 12, color: NAVY, fontFamily: FONT_FAMILY.urbanistSemiBold },
  segment: { flexDirection: 'row', marginTop: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
  segItemActive: { backgroundColor: ORANGE },
  segText: { fontSize: 12, color: '#374151', fontFamily: FONT_FAMILY.urbanistSemiBold },
  segTextActive: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  stepVal: { minWidth: 42, textAlign: 'center', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 6 },
  shareNote: { fontSize: 11, color: '#92400e', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 8, marginBottom: 2 },
  hfRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 10, padding: 8, marginTop: 8 },
  miniInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 4, backgroundColor: '#fff' },
  hfAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed' },
  hfAddText: { color: NAVY, fontFamily: FONT_FAMILY.urbanistSemiBold, fontSize: 13 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fef2f2' },
  deleteBtnText: { color: '#dc2626', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14 },
  modalCenter: { margin: 24, justifyContent: 'center' },
  pickerCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  modalTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827', marginBottom: 8 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerRowText: { fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },
});

export default InvoiceLayoutEditorScreen;
