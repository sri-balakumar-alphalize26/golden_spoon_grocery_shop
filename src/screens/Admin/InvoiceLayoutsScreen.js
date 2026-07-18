// Invoice Layouts — one block-based layout per paper size, designed with the
// Odoo drag-&-drop / grid visual editor. The app does NOT edit layouts (that
// stays in Odoo web); it lists them and shows a PRINT-EXACT server-rendered
// preview per size, so grid/flow placement is honored exactly. To actually use
// a layout, pick "Custom Layout (editable)" as the template in General Settings.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
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
import { fetchInvoiceLayouts, fetchLayoutPreviewHtml } from '@api/services/generalApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const InvoiceLayoutsScreen = ({ navigation, route }) => {
  const authUser = useAuthStore((s) => s.user);
  const companyId = route?.params?.companyId ?? null;

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');

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
      const list = await fetchInvoiceLayouts(companyId);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      showToastMessage(e?.message || 'Failed to load layouts');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(useCallback(() => { if (isAdmin) load(); }, [isAdmin, load]));

  const openPreview = async (item) => {
    setPreviewTitle(item.paper_size_label || item.name || 'Layout');
    setPreviewHtml('');
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const html = await fetchLayoutPreviewHtml(item.id);
      if (!html) { showToastMessage('No preview yet — make a sale first, then retry.'); setPreviewOpen(false); return; }
      setPreviewHtml(html);
    } catch (e) {
      showToastMessage(e?.message || 'Preview failed');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Tap a size → open the native layout detail (blocks + Open Visual Editor).
  // The eye button is a quick preview.
  const openDetail = (item) => {
    navigation.navigate('InvoiceLayoutDetail', {
      layoutId: item.id,
      title: item.paper_size_label || item.name,
    });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={() => openDetail(item)}>
      <View style={styles.rowIcon}>
        <MaterialIcons name="dashboard-customize" size={22} color={NAVY} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.paper_size_label || item.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.name}{item.positioning ? `  ·  ${item.positioning === 'grid' ? 'Grid' : 'Flow'}` : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={() => openPreview(item)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="visibility" size={20} color={ORANGE} />
      </TouchableOpacity>
      <MaterialIcons name="chevron-right" size={22} color="#c7ccd6" />
    </TouchableOpacity>
  );

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="Invoice Layouts" onBackPress={() => navigation.goBack()} />
        <View style={styles.center}><Text style={styles.muted}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Invoice Layouts" onBackPress={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => `ly-${it.id}`}
          renderItem={renderItem}
          style={{ backgroundColor: '#fff' }}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ORANGE} />}
          ListHeaderComponent={(
            <View style={styles.note}>
              <MaterialIcons name="info-outline" size={18} color="#b45309" />
              <Text style={styles.noteText}>
                Tap a size to open its layout — edit its blocks in the visual editor.
                Use the eye icon for a quick preview. To use a layout, pick
                “Custom Layout” in General Settings.
              </Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No layouts yet — add a paper size to create one.</Text>}
        />
      )}

      {/* Print-exact server preview */}
      <Modal
        isVisible={previewOpen}
        style={styles.previewModal}
        onBackButtonPress={() => setPreviewOpen(false)}
        onBackdropPress={() => setPreviewOpen(false)}
        backdropOpacity={0.5}
      >
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{previewTitle}</Text>
            <TouchableOpacity onPress={() => setPreviewOpen(false)} style={styles.previewClose}>
              <MaterialIcons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          {previewLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
          ) : (
            <WebView
              originWhitelist={['*']}
              source={{ html: previewHtml }}
              style={{ flex: 1, backgroundColor: '#fff' }}
              scalesPageToFit
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', minHeight: 120 },
  muted: { color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 30, fontFamily: FONT_FAMILY.urbanistMedium },
  note: {
    flexDirection: 'row', gap: 8, backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1,
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  noteText: { flex: 1, fontSize: 12, color: '#92400e', fontFamily: FONT_FAMILY.urbanistMedium, lineHeight: 17 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eef0f4',
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3E5F5',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  rowSub: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#9ca3af', marginTop: 2 },
  iconBtn: { padding: 6, marginLeft: 2 },
  previewModal: { margin: 10, justifyContent: 'center' },
  previewCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginVertical: 30 },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef0f4',
  },
  previewTitle: { flex: 1, fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  previewClose: { padding: 4, marginLeft: 8 },
});

export default InvoiceLayoutsScreen;
