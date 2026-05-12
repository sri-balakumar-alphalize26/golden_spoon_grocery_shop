// In-app admin to hide React Native UI elements per Odoo user. Reads/writes
// the same `app.feature.visibility` rows the Odoo backend manages, so a
// change made here is identical to one an Odoo admin would have made.
//
// Layout: tap the user-picker → modal with searchable user list → pick →
// the feature list shows toggles. Toggles persist immediately (no Save
// button) — same UX as Odoo's boolean_toggle widgets.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Switch, FlatList, Modal,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer, SearchContainer } from '@components/containers';
import { OverlayLoader } from '@components/Loader';
import { EmptyState } from '@components/common/empty';
import { useAuthStore } from '@stores/auth';
import {
  fetchUsersOdoo,
  fetchAppFeaturesOdoo,
  fetchHiddenAppFeaturesAdmin,
  setAppFeatureHiddenForUser,
} from '@api/services/generalApi';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';
const SOFT_BG = '#F5F6FA';

const AppFeaturesScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);

  const [isAdmin, setIsAdmin] = useState(false);
  const [features, setFeatures] = useState([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [hiddenIds, setHiddenIds] = useState(new Set()); // feature_id values
  const [loadingHidden, setLoadingHidden] = useState(false);

  // Tracks which feature toggles are currently in-flight so we can disable them
  const [savingIds, setSavingIds] = useState(new Set());

  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Admin guard — same shape as UsersScreen so behavior is consistent.
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

  // Load the catalog once for admins.
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoadingFeatures(true);
      const rows = await fetchAppFeaturesOdoo();
      setFeatures(rows);
      setLoadingFeatures(false);
    })();
  }, [isAdmin]);

  // When a user is picked, fetch their per-user hide rows.
  const loadHiddenForUser = useCallback(async (uid) => {
    setLoadingHidden(true);
    try {
      const rows = await fetchHiddenAppFeaturesAdmin(uid);
      setHiddenIds(new Set(rows.map((r) => Array.isArray(r.feature_id) ? r.feature_id[0] : r.feature_id)));
    } finally {
      setLoadingHidden(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setHiddenIds(new Set());
      return;
    }
    loadHiddenForUser(selectedUser.id);
  }, [selectedUser, loadHiddenForUser]);

  // ── User picker modal ─────────────────────────────────────────────
  const fetchUsers = useCallback(async (text) => {
    setLoadingUsers(true);
    try {
      const rows = await fetchUsersOdoo({ searchText: text || '', limit: 50, offset: 0 });
      // fetchUsersOdoo can return an array directly, or an object with .data depending on signature
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
    setSelectedUser({ id: u.id, name: u.name, login: u.login });
    setPickerOpen(false);
  };

  // ── Toggle a feature for the current selectedUser ─────────────────
  const handleToggle = useCallback(async (feature, nextHidden) => {
    if (!selectedUser) return;
    const fid = feature.id;
    // Optimistic flip
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (nextHidden) next.add(fid); else next.delete(fid);
      return next;
    });
    setSavingIds((prev) => new Set(prev).add(fid));
    try {
      await setAppFeatureHiddenForUser(selectedUser.id, fid, nextHidden);
      // If the admin is editing their own user, refresh the auth store cache
      // so the change takes effect on the current session immediately.
      const currentUid = authUser?.uid || authUser?.id;
      if (currentUid && Number(currentUid) === Number(selectedUser.id)) {
        try { await useAuthStore.getState().refreshHiddenFeatures(currentUid); } catch (_) {}
      }
    } catch (err) {
      // Revert
      setHiddenIds((prev) => {
        const next = new Set(prev);
        if (nextHidden) next.delete(fid); else next.add(fid);
        return next;
      });
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err?.message || 'Could not update visibility',
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(fid);
        return next;
      });
    }
  }, [selectedUser, authUser]);

  // ── Render ────────────────────────────────────────────────────────
  const renderFeatureRow = ({ item: feature }) => {
    const isHidden = hiddenIds.has(feature.id);
    const isSaving = savingIds.has(feature.id);
    return (
      <View style={styles.featureRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.featureName}>{feature.name}</Text>
          <Text style={styles.featureKey}>{feature.feature_key}</Text>
          {feature.description ? (
            <Text style={styles.featureDesc} numberOfLines={2}>{feature.description}</Text>
          ) : null}
        </View>
        <View style={styles.switchWrap}>
          <Text style={[styles.switchLabel, { color: isHidden ? '#c0392b' : '#16a34a' }]}>
            {isHidden ? 'Hidden' : 'Visible'}
          </Text>
          <Switch
            value={isHidden}
            disabled={isSaving}
            onValueChange={(v) => handleToggle(feature, v)}
            trackColor={{ false: '#cbd5e1', true: '#fca5a5' }}
            thumbColor={isHidden ? '#dc2626' : '#f8fafc'}
          />
        </View>
      </View>
    );
  };

  const renderUserRow = ({ item }) => {
    const adminBadge = item._isAdmin ? (
      <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>
    ) : null;
    return (
      <TouchableOpacity style={styles.userRow} onPress={() => handlePickUser(item)} activeOpacity={0.7}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userLogin}>{item.login}</Text>
        </View>
        {adminBadge}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="App Features" onBackPress={() => navigation.goBack()} />
      <RoundedContainer>
        <View style={styles.helpBanner}>
          <Icon name="info-outline" size={18} color={NAVY} />
          <Text style={styles.helpText}>
            Toggle Hidden / Visible for each feature. Changes apply on the user's next login.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.userPicker}
          activeOpacity={0.7}
          onPress={() => setPickerOpen(true)}
        >
          <Icon name="person" size={20} color={NAVY} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.pickerLabel}>User</Text>
            <Text style={styles.pickerValue}>
              {selectedUser ? `${selectedUser.name} (${selectedUser.login})` : 'Tap to pick a user'}
            </Text>
          </View>
          <Icon name="chevron-right" size={22} color={MUTED} />
        </TouchableOpacity>

        {!selectedUser ? (
          <EmptyState
            imageSource={null}
            message="Pick a user above to manage their visible features."
          />
        ) : (
          <FlatList
            data={features}
            keyExtractor={(f) => `feat-${f.id}`}
            renderItem={renderFeatureRow}
            ListEmptyComponent={
              loadingFeatures ? null : (
                <View style={{ padding: 24 }}>
                  <Text style={{ color: MUTED, textAlign: 'center' }}>
                    No features defined yet. Create one in Odoo: Privilege Manager → App Features.
                  </Text>
                </View>
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={loadingHidden}
                onRefresh={() => loadHiddenForUser(selectedUser.id)}
              />
            }
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </RoundedContainer>

      <OverlayLoader visible={loadingFeatures && !features.length} />

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick a user</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Icon name="close" size={22} color="#1a1a2e" />
              </TouchableOpacity>
            </View>
            <SearchContainer
              value={searchText}
              onChangeText={handleSearchTextChange}
              placeholder="Search by name or login"
            />
            {loadingUsers ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={NAVY} />
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
                contentContainerStyle={{ paddingBottom: 16 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  helpBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eef2ff', padding: 10, borderRadius: 8,
    marginHorizontal: 12, marginTop: 12,
  },
  helpText: { flex: 1, color: '#1e293b', fontSize: 12, fontFamily: FONT_FAMILY.regular },
  userPicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: 10,
    margin: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  pickerLabel: { fontSize: 11, color: MUTED, fontFamily: FONT_FAMILY.regular },
  pickerValue: { fontSize: 15, color: '#1a1a2e', fontFamily: FONT_FAMILY.semiBold, marginTop: 2 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: 10,
    marginHorizontal: 12, marginVertical: 4,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  featureName: { fontSize: 15, color: '#1a1a2e', fontFamily: FONT_FAMILY.semiBold },
  featureKey: { fontSize: 11, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.regular },
  featureDesc: { fontSize: 12, color: '#475569', marginTop: 4, fontFamily: FONT_FAMILY.regular },
  switchWrap: { alignItems: 'center', marginLeft: 12 },
  switchLabel: { fontSize: 11, fontFamily: FONT_FAMILY.semiBold, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: SOFT_BG, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 16, maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  modalTitle: { fontSize: 17, fontFamily: FONT_FAMILY.semiBold, color: '#1a1a2e' },
  userRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
  },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#bfdbfe',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  userAvatarText: { fontFamily: FONT_FAMILY.semiBold, color: '#1a1a2e' },
  userName: { fontSize: 14, color: '#1a1a2e', fontFamily: FONT_FAMILY.semiBold },
  userLogin: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.regular },
  adminBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  adminBadgeText: { fontSize: 10, color: '#92400e', fontFamily: FONT_FAMILY.semiBold },
});

export default AppFeaturesScreen;
