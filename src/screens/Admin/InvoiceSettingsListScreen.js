// Admin list of dynamic-invoice settings (one row per company), mirroring the
// Odoo web list view: you land on the list, then tap a row to open the editor
// (InvoiceSettingsScreen). Admin-only, same guard shape as AppFeaturesScreen.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import Modal from 'react-native-modal';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { fetchInvoiceSettingsList, deleteInvoiceSettings } from '@api/services/generalApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const InvoiceSettingsListScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [confirmItem, setConfirmItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
      const list = await fetchInvoiceSettingsList();
      if (list === null) {
        showToastMessage('Dynamic Invoice module not installed on this Odoo');
        setTimeout(() => navigation.goBack(), 1500);
        return;
      }
      setRows(list);
    } catch (e) {
      showToastMessage(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  // Reload on focus so returning from the editor shows the latest on/off state.
  useFocusEffect(useCallback(() => { if (isAdmin) load(); }, [isAdmin, load]));

  const openRecord = (id) => {
    console.log('[InvoiceSettingsList] open editor id=', id ?? '(edit current)');
    navigation.navigate('InvoiceSettings', { id });
  };
  const openNew = () => {
    console.log('[InvoiceSettingsList] New tapped → create mode');
    navigation.navigate('InvoiceSettings', { isNew: true });
  };

  const companyName = (row) => (Array.isArray(row.company_id) ? row.company_id[1] : 'Company');

  const onDelete = (item) => setConfirmItem(item);

  const confirmDelete = async () => {
    if (!confirmItem) return;
    setDeleting(true);
    try {
      await deleteInvoiceSettings(confirmItem.id);
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
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => openRecord(item.id)}>
      <View style={styles.rowIcon}>
        <MaterialIcons name="receipt-long" size={22} color={NAVY} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{companyName(item)}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.brand_name ? item.brand_name : 'Invoice branding & options'}
        </Text>
      </View>
      <View style={[styles.badge, item.use_dynamic_invoice ? styles.badgeOn : styles.badgeOff]}>
        <Text style={[styles.badgeText, item.use_dynamic_invoice ? styles.badgeTextOn : styles.badgeTextOff]}>
          {item.use_dynamic_invoice ? 'DYNAMIC' : 'NORMAL'}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onDelete(item)}
        style={styles.delBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
      </TouchableOpacity>
      <MaterialIcons name="chevron-right" size={22} color="#c7ccd6" />
    </TouchableOpacity>
  );

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="Invoice Settings" onBackPress={() => navigation.goBack()} />
        <View style={styles.center}><Text style={styles.muted}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Invoice Settings" onBackPress={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => `is-${it.id}`}
          renderItem={renderItem}
          style={{ backgroundColor: '#fff' }}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ORANGE} />}
          ListEmptyComponent={(
            <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={openNew}>
              <View style={styles.rowIcon}><MaterialIcons name="receipt-long" size={22} color={NAVY} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Add Invoice Settings</Text>
                <Text style={styles.rowSub}>Tap to create for a company</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#c7ccd6" />
            </TouchableOpacity>
          )}
        />
      )}

      {!loading ? (
        <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openNew}>
          <MaterialIcons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>New</Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        isVisible={!!confirmItem}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.7}
        animationInTiming={400}
        animationOutTiming={300}
        onBackButtonPress={() => setConfirmItem(null)}
        onBackdropPress={() => setConfirmItem(null)}
      >
        <View style={styles.alertContainer}>
          <Text style={styles.alertText}>
            Delete invoice settings for {confirmItem ? companyName(confirmItem) : ''}?
          </Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  muted: { color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eef0f4',
  },
  delBtn: { padding: 4, marginRight: 4 },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3E5F5',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  rowSub: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#9ca3af', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6 },
  badgeOn: { backgroundColor: '#dcfce7' },
  badgeOff: { backgroundColor: '#f1f5f9' },
  badgeText: { fontSize: 10, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.5 },
  badgeTextOn: { color: '#16a34a' },
  badgeTextOff: { color: '#64748b' },
  // Logout-style confirm popup
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
  fab: {
    position: 'absolute', right: 18, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ORANGE, borderRadius: 28, paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 2 },
});

export default InvoiceSettingsListScreen;
