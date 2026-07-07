// In-app admin to manage `module.privilege` records (CRUD permissions per
// Odoo app, per user) — mirrors the OWL Privilege Manager dashboard's
// MODULE-BASED PRIVILEGES section. Reuses the centered user-picker pattern
// and stat-tile row from AppFeaturesScreen.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Switch, FlatList, TextInput,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import RNModal from 'react-native-modal';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { OverlayLoader } from '@components/Loader';
import { useAuthStore } from '@stores/auth';
import {
  fetchUsersOdoo,
  fetchPrivilegeStatsForUser,
  fetchUserModulesAdmin,
  fetchInstallableModulesAdmin,
  setModuleMasterPermAdmin,
  grantAllModuleAdmin,
  readOnlyModuleAdmin,
  addModuleAdmin,
  removeModuleAdmin,
} from '@api/services/generalApi';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';

const STAT_TILES = [
  { key: 'groups',       label: 'GROUPS',        accent: '#7c3aed' },
  { key: 'modules',      label: 'MODULES',       accent: '#d97706' },
  { key: 'hidden_menus', label: 'HIDDEN MENUS',  accent: '#e85d00' },
  { key: 'hidden_apps',  label: 'HIDDEN APPS',   accent: '#dc2626' },
];

const ZERO_STATS = { groups: 0, modules: 0, hidden_menus: 0, hidden_apps: 0, hidden_features: 0 };

const PERM_FIELDS = [
  { key: 'master_read',   label: 'Read'   },
  { key: 'master_create', label: 'Create' },
  { key: 'master_write',  label: 'Edit'   },
  { key: 'master_cancel', label: 'Cancel' },
  { key: 'master_unlink', label: 'Delete' },
];

const ModulePrivilegesScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);

  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [stats, setStats] = useState(ZERO_STATS);
  const [loadingModules, setLoadingModules] = useState(false);
  const [savingMpIds, setSavingMpIds] = useState(new Set());

  // User picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Add Module picker
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [installable, setInstallable] = useState([]);
  const [loadingInstallable, setLoadingInstallable] = useState(false);

  // ── Admin gate ────────────────────────────────────────────────────
  useEffect(() => {
    const ok = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(ok);
    if (!ok) {
      Toast.show({
        type: 'error',
        text1: 'Access Denied',
        text2: 'Only administrators can access this feature',
      });
      setTimeout(() => navigation.goBack(), 2000);
    }
  }, [authUser, navigation]);

  // ── Per-user data ─────────────────────────────────────────────────
  const loadUserData = useCallback(async (uid) => {
    setLoadingModules(true);
    try {
      const [mods, statsResult] = await Promise.all([
        fetchUserModulesAdmin(uid),
        fetchPrivilegeStatsForUser(uid),
      ]);
      setModules(mods);
      setStats(statsResult);
    } finally {
      setLoadingModules(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setModules([]);
      setStats(ZERO_STATS);
      return;
    }
    loadUserData(selectedUser.id);
  }, [selectedUser, loadUserData]);

  // ── User picker ───────────────────────────────────────────────────
  const fetchUsers = useCallback(async (text) => {
    setLoadingUsers(true);
    try {
      const rows = await fetchUsersOdoo({ searchText: text || '', limit: 50, offset: 0 });
      const list = Array.isArray(rows) ? rows : (rows?.data || []);
      setUsers(list);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchUsers(text),
    400,
  );

  useEffect(() => {
    if (pickerOpen) fetchUsers('');
  }, [pickerOpen, fetchUsers]);

  const handlePickUser = (u) => {
    setSelectedUser({ id: u.id, name: u.name, login: u.login, _isAdmin: u._isAdmin });
    setPickerOpen(false);
  };

  // ── Add Module picker ─────────────────────────────────────────────
  const fetchInstallable = useCallback(async (text) => {
    if (!selectedUser) return;
    setLoadingInstallable(true);
    try {
      const rows = await fetchInstallableModulesAdmin(selectedUser.id, text || '');
      setInstallable(rows);
    } finally {
      setLoadingInstallable(false);
    }
  }, [selectedUser]);

  const addSearchHook = useDebouncedSearch(
    (text) => fetchInstallable(text),
    400,
  );

  useEffect(() => {
    if (addModuleOpen) fetchInstallable('');
  }, [addModuleOpen, fetchInstallable]);

  const handleAddModule = async (mod) => {
    setAddModuleOpen(false);
    if (!selectedUser) return;
    try {
      await addModuleAdmin(selectedUser.id, mod.id);
      await loadUserData(selectedUser.id);
      Toast.show({
        type: 'success',
        text1: 'Module added',
        text2: mod.shortdesc || mod.name,
      });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Add failed',
        text2: err?.message || 'Could not add module',
      });
    }
  };

  // ── Toggle / Grant All / Read Only / Remove ───────────────────────
  const updateMpLocally = (mpId, patch) => {
    setModules((prev) => prev.map((m) => (m.id === mpId ? { ...m, ...patch } : m)));
  };

  const setSaving = (mpId, on) => {
    setSavingMpIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(mpId); else next.delete(mpId);
      return next;
    });
  };

  const handlePermToggle = useCallback(async (mp, field, nextValue) => {
    const prevValue = mp[field];
    updateMpLocally(mp.id, { [field]: nextValue });
    setSaving(mp.id, true);
    try {
      await setModuleMasterPermAdmin(mp.id, field, nextValue);
    } catch (err) {
      updateMpLocally(mp.id, { [field]: prevValue });
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err?.message || 'Could not update permission',
      });
    } finally {
      setSaving(mp.id, false);
    }
  }, []);

  const handleGrantAll = useCallback(async (mp) => {
    const snapshot = { ...mp };
    updateMpLocally(mp.id, {
      master_read: true, master_create: true, master_write: true,
      master_cancel: true, master_unlink: true,
    });
    setSaving(mp.id, true);
    try {
      await grantAllModuleAdmin(mp.id);
    } catch (err) {
      updateMpLocally(mp.id, snapshot);
      Toast.show({ type: 'error', text1: 'Save failed', text2: err?.message });
    } finally {
      setSaving(mp.id, false);
    }
  }, []);

  const handleReadOnly = useCallback(async (mp) => {
    const snapshot = { ...mp };
    updateMpLocally(mp.id, {
      master_read: true, master_create: false, master_write: false,
      master_cancel: false, master_unlink: false,
    });
    setSaving(mp.id, true);
    try {
      await readOnlyModuleAdmin(mp.id);
    } catch (err) {
      updateMpLocally(mp.id, snapshot);
      Toast.show({ type: 'error', text1: 'Save failed', text2: err?.message });
    } finally {
      setSaving(mp.id, false);
    }
  }, []);

  const handleRemove = useCallback((mp) => {
    Alert.alert(
      'Remove module privilege?',
      `Revoke "${mp.module_shortdesc}" for ${selectedUser?.name}? This also removes all derived CRUD privileges for this module.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSaving(mp.id, true);
            try {
              await removeModuleAdmin(mp.id);
              await loadUserData(selectedUser.id);
              Toast.show({ type: 'success', text1: 'Removed', text2: mp.module_shortdesc });
            } catch (err) {
              Toast.show({ type: 'error', text1: 'Remove failed', text2: err?.message });
            } finally {
              setSaving(mp.id, false);
            }
          },
        },
      ],
    );
  }, [selectedUser, loadUserData]);

  const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

  // ── Renderers ─────────────────────────────────────────────────────
  const renderModuleCard = ({ item: mp }) => {
    const isSaving = savingMpIds.has(mp.id);
    return (
      <View style={styles.moduleCard}>
        <View style={styles.moduleHeader}>
          <Icon name="apps" size={18} color={NAVY} />
          <Text style={styles.moduleName} numberOfLines={1}>{mp.module_shortdesc}</Text>
          <TouchableOpacity
            style={styles.trashBtn}
            onPress={() => handleRemove(mp)}
            disabled={isSaving}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Icon name="delete-outline" size={20} color="#dc2626" />
          </TouchableOpacity>
        </View>

        <View style={styles.permsRow}>
          {PERM_FIELDS.map((f) => (
            <View key={f.key} style={styles.permCell}>
              <Switch
                value={!!mp[f.key]}
                disabled={isSaving}
                onValueChange={(v) => handlePermToggle(mp, f.key, v)}
                trackColor={{ false: '#cbd5e1', true: '#86efac' }}
                thumbColor={mp[f.key] ? '#16a34a' : '#f8fafc'}
              />
              <Text style={styles.permLabel}>{f.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.bulkRow}>
          <TouchableOpacity
            style={[styles.bulkBtn, styles.grantBtn]}
            onPress={() => handleGrantAll(mp)}
            disabled={isSaving}
          >
            <Icon name="check-circle" size={14} color="#16a34a" />
            <Text style={[styles.bulkBtnText, { color: '#16a34a' }]}>Grant All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkBtn, styles.readBtn]}
            onPress={() => handleReadOnly(mp)}
            disabled={isSaving}
          >
            <Icon name="visibility" size={14} color="#0284c7" />
            <Text style={[styles.bulkBtnText, { color: '#0284c7' }]}>Read Only</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderUserRow = ({ item }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => handlePickUser(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.userAvatar, { backgroundColor: item._isAdmin ? '#fde68a' : '#bfdbfe' }]}>
        <Text style={styles.userAvatarText}>{initialOf(item.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.userLogin} numberOfLines={1}>{item.login}</Text>
      </View>
      {item._isAdmin ? (
        <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>
      ) : null}
      <Icon name="chevron-right" size={22} color={MUTED} />
    </TouchableOpacity>
  );

  const renderInstallableRow = ({ item }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => handleAddModule(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.userAvatar, { backgroundColor: '#eef2ff' }]}>
        <Icon name="extension" size={20} color={NAVY} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.userName} numberOfLines={1}>{item.shortdesc || item.name}</Text>
        <Text style={styles.userLogin} numberOfLines={1}>{item.name}</Text>
      </View>
      <Icon name="add-circle-outline" size={22} color={NAVY} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Module Privileges" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>

        {/* ── Selected-user card / picker entry point ── */}
        {selectedUser ? (
          <View style={styles.selectedUserCard}>
            <View style={[styles.userAvatar, styles.userAvatarLg, { backgroundColor: selectedUser._isAdmin ? '#fde68a' : '#bfdbfe' }]}>
              <Text style={styles.userAvatarTextLg}>{initialOf(selectedUser.name)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.selectedUserName} numberOfLines={1}>{selectedUser.name}</Text>
              <Text style={styles.selectedUserLogin} numberOfLines={1}>{selectedUser.login}</Text>
            </View>
            <TouchableOpacity
              style={styles.changeBtn}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.7}
            >
              <Icon name="swap-horiz" size={16} color={NAVY} />
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.userPickerEmpty}
            activeOpacity={0.7}
            onPress={() => setPickerOpen(true)}
          >
            <View style={styles.userPickerEmptyIcon}>
              <Icon name="person-search" size={26} color={NAVY} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.pickerEmptyTitle}>Pick a user</Text>
              <Text style={styles.pickerEmptySub}>Choose whose module privileges to manage</Text>
            </View>
            <Icon name="chevron-right" size={24} color={MUTED} />
          </TouchableOpacity>
        )}

        {/* ── Stat tiles ── */}
        {selectedUser ? (
          <View style={styles.statsRow}>
            {STAT_TILES.map((t) => (
              <View key={t.key} style={styles.statTile}>
                <Text style={styles.statNumber}>{stats[t.key] ?? 0}</Text>
                <Text style={[styles.statLabel, { color: t.accent }]}>{t.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Add Module button ── */}
        {selectedUser ? (
          <TouchableOpacity
            style={styles.addModuleBtn}
            onPress={() => setAddModuleOpen(true)}
            activeOpacity={0.8}
          >
            <Icon name="add" size={18} color="#fff" />
            <Text style={styles.addModuleBtnText}>Add Module</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Module cards ── */}
        {!selectedUser ? (
          <View style={styles.bigEmpty}>
            <Icon name="security" size={48} color="#cbd5e1" />
            <Text style={styles.bigEmptyTitle}>No user selected</Text>
            <Text style={styles.bigEmptySub}>
              Pick a user above to see and manage their module-based privileges.
            </Text>
          </View>
        ) : (
          <FlatList
            data={modules}
            keyExtractor={(m) => `mp-${m.id}`}
            renderItem={renderModuleCard}
            ListEmptyComponent={
              loadingModules ? null : (
                <View style={styles.bigEmpty}>
                  <Icon name="inbox" size={42} color="#cbd5e1" />
                  <Text style={styles.bigEmptyTitle}>No modules yet</Text>
                  <Text style={styles.bigEmptySub}>
                    Tap "+ Add Module" above to grant this user CRUD on an installed app module.
                  </Text>
                </View>
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={loadingModules}
                onRefresh={() => loadUserData(selectedUser.id)}
                tintColor={NAVY}
                colors={[NAVY]}
              />
            }
            contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </RoundedContainer>

      <OverlayLoader visible={loadingModules && modules.length === 0 && !!selectedUser} />

      {/* ── User picker popup ── */}
      <RNModal
        isVisible={pickerOpen}
        onBackdropPress={() => setPickerOpen(false)}
        onBackButtonPress={() => setPickerOpen(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.55}
        useNativeDriver
        style={styles.modalRoot}
      >
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="person-search" size={20} color={NAVY} />
              <Text style={styles.pickerTitle}>Select User</Text>
            </View>
            <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Icon name="close" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          </View>
          <View style={styles.pickerSearchWrap}>
            <View style={styles.pickerSearchBar}>
              <Icon name="search" size={18} color={MUTED} />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search by name or login"
                placeholderTextColor={MUTED}
                value={searchText}
                onChangeText={handleSearchTextChange}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          </View>
          {loadingUsers ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator color={NAVY} />
              <Text style={styles.pickerLoadingText}>Loading users…</Text>
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => `user-${u.id}`}
              renderItem={renderUserRow}
              ListEmptyComponent={
                <View style={{ padding: 24 }}>
                  <Text style={{ color: MUTED, textAlign: 'center' }}>No users matched.</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </RNModal>

      {/* ── Add Module popup ── */}
      <RNModal
        isVisible={addModuleOpen}
        onBackdropPress={() => setAddModuleOpen(false)}
        onBackButtonPress={() => setAddModuleOpen(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.55}
        useNativeDriver
        style={styles.modalRoot}
      >
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="extension" size={20} color={NAVY} />
              <Text style={styles.pickerTitle}>Add Module</Text>
            </View>
            <TouchableOpacity onPress={() => setAddModuleOpen(false)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Icon name="close" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          </View>
          <View style={styles.pickerSearchWrap}>
            <View style={styles.pickerSearchBar}>
              <Icon name="search" size={18} color={MUTED} />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search modules"
                placeholderTextColor={MUTED}
                value={addSearchHook.searchText}
                onChangeText={addSearchHook.handleSearchTextChange}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          </View>
          {loadingInstallable ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator color={NAVY} />
              <Text style={styles.pickerLoadingText}>Loading modules…</Text>
            </View>
          ) : (
            <FlatList
              data={installable}
              keyExtractor={(m) => `mod-${m.id}`}
              renderItem={renderInstallableRow}
              ListEmptyComponent={
                <View style={{ padding: 24 }}>
                  <Text style={{ color: MUTED, textAlign: 'center' }}>
                    No installable modules left to add for this user.
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </RNModal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Selected-user card
  selectedUserCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: 14,
    marginHorizontal: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  selectedUserName: { fontSize: 15, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold },
  selectedUserLogin: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.regular },
  changeBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#eef2ff', borderRadius: 8, gap: 4,
  },
  changeBtnText: { fontSize: 12, color: NAVY, fontFamily: FONT_FAMILY.semiBold },

  userPickerEmpty: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: 14,
    marginHorizontal: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed',
  },
  userPickerEmptyIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  pickerEmptyTitle: { fontSize: 15, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold },
  pickerEmptySub: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.regular },

  // Stat tiles
  statsRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: 10, gap: 8 },
  statTile: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  statNumber: { fontSize: 22, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold },
  statLabel: { fontSize: 9, fontFamily: FONT_FAMILY.semiBold, letterSpacing: 0.4, marginTop: 4, textAlign: 'center' },

  // Add Module button
  addModuleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: NAVY,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 10,
    marginHorizontal: 12, marginTop: 10, marginBottom: 6,
    gap: 6,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  addModuleBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.semiBold },

  // Module card
  moduleCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 12, marginVertical: 6,
    padding: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  moduleHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 10, marginBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  moduleName: { flex: 1, fontSize: 15, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold },
  trashBtn: { padding: 4 },

  permsRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  permCell: {
    alignItems: 'center', justifyContent: 'center',
    width: '18%', minWidth: 56,
    paddingVertical: 4,
  },
  permLabel: { fontSize: 10, color: '#475569', marginTop: 4, fontFamily: FONT_FAMILY.semiBold },

  bulkRow: {
    flexDirection: 'row', justifyContent: 'flex-start',
    gap: 8, marginTop: 12,
  },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, gap: 4,
    borderWidth: 1,
  },
  grantBtn: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  readBtn:  { backgroundColor: '#e0f2fe', borderColor: '#bae6fd' },
  bulkBtnText: { fontSize: 12, fontFamily: FONT_FAMILY.semiBold },

  // Empty states
  bigEmpty: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingVertical: 48,
  },
  bigEmptyTitle: { fontSize: 15, color: '#475569', marginTop: 12, fontFamily: FONT_FAMILY.semiBold },
  bigEmptySub: { fontSize: 12, color: MUTED, marginTop: 6, textAlign: 'center', fontFamily: FONT_FAMILY.regular },

  // Modal
  modalRoot: { justifyContent: 'center', alignItems: 'center', margin: 0 },
  pickerCard: {
    width: '90%', maxWidth: 440, maxHeight: '80%',
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  pickerTitle: { fontSize: 16, fontFamily: FONT_FAMILY.semiBold, color: '#0f172a', marginLeft: 8 },
  pickerSearchWrap: { paddingHorizontal: 12, paddingVertical: 10 },
  pickerSearchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f5f9', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  pickerSearchInput: {
    flex: 1, padding: 0,
    fontFamily: FONT_FAMILY.regular, fontSize: 14, color: '#0f172a',
  },
  pickerLoading: { alignItems: 'center', padding: 24, gap: 8 },
  pickerLoadingText: { fontSize: 12, color: MUTED, fontFamily: FONT_FAMILY.regular },

  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    marginHorizontal: 8, marginVertical: 3,
    backgroundColor: '#f8fafc', borderRadius: 10,
  },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  userAvatarLg: { width: 46, height: 46, borderRadius: 23, marginRight: 0 },
  userAvatarText: { fontFamily: FONT_FAMILY.semiBold, color: '#1a1a2e' },
  userAvatarTextLg: { fontFamily: FONT_FAMILY.semiBold, color: '#1a1a2e', fontSize: 18 },
  userName: { fontSize: 14, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold },
  userLogin: { fontSize: 11, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.regular },
  adminBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, marginRight: 6,
  },
  adminBadgeText: { fontSize: 9, color: '#92400e', fontFamily: FONT_FAMILY.semiBold, letterSpacing: 0.3 },
});

export default ModulePrivilegesScreen;
