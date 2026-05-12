// In-app admin to hide React Native UI elements per Odoo user. Reads/writes
// the same `app.feature.visibility` rows the Odoo backend manages, so a
// change made here is identical to one an Odoo admin would have made.
//
// Layout (top → bottom):
//   • selected-user card (or "Pick a user" empty CTA)
//   • 4 privilege stat tiles (GROUPS / MODULES / HIDDEN MENUS / HIDDEN APPS)
//   • hint line
//   • grouped feature list with collapsible sub-sections
//
// Toggles persist immediately (no Save button). The user picker is a centered
// RNModal popup matching the in-app convention (LogoutModal etc.).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Switch, FlatList, TextInput,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import RNModal from 'react-native-modal';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { OverlayLoader } from '@components/Loader';
import { useAuthStore } from '@stores/auth';
import {
  fetchUsersOdoo,
  fetchAppFeaturesOdoo,
  fetchHiddenAppFeaturesAdmin,
  fetchPrivilegeStatsForUser,
  setAppFeatureHiddenForUser,
} from '@api/services/generalApi';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';

const VISIBLE_ACCENT = '#16a34a';
const VISIBLE_BG = '#dcfce7';
const HIDDEN_ACCENT = '#dc2626';
const HIDDEN_BG = '#fee2e2';

// Stat tile palette — mirrors the Odoo Privilege Manager dashboard.
const STAT_TILES = [
  { key: 'groups',       label: 'GROUPS',        accent: '#7c3aed' },
  { key: 'modules',      label: 'MODULES',       accent: '#d97706' },
  { key: 'hidden_menus', label: 'HIDDEN MENUS',  accent: '#e85d00' },
  { key: 'hidden_apps',  label: 'HIDDEN APPS',   accent: '#dc2626' },
];

const ZERO_STATS = { groups: 0, modules: 0, hidden_menus: 0, hidden_apps: 0, hidden_features: 0 };

// Turn a feature_key into a (groupKey, groupLabel) pair. Group key = the
// dotted prefix minus the last segment; label = title-cased segments.
const groupOf = (feature) => {
  const key = feature.feature_key || '';
  const parts = key.split('.').filter(Boolean);
  if (parts.length <= 1) {
    return { groupKey: '_misc', groupLabel: 'Other' };
  }
  const groupKey = parts.slice(0, -1).join('.');
  const groupLabel = groupKey
    .split('.')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ') + (parts.length > 2 ? 's' : '');
  return { groupKey, groupLabel };
};

const AppFeaturesScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);

  const [isAdmin, setIsAdmin] = useState(false);
  const [features, setFeatures] = useState([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [stats, setStats] = useState(ZERO_STATS);
  const [loadingHidden, setLoadingHidden] = useState(false);

  const [savingIds, setSavingIds] = useState(new Set());

  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Collapsed group keys (Set of groupKey strings). Default empty = all expanded.
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

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

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoadingFeatures(true);
      const rows = await fetchAppFeaturesOdoo();
      setFeatures(rows);
      setLoadingFeatures(false);
    })();
  }, [isAdmin]);

  // Per-user data: both hides and stats in parallel, single in-flight flag.
  const loadUserData = useCallback(async (uid) => {
    setLoadingHidden(true);
    try {
      const [hideRows, statsResult] = await Promise.all([
        fetchHiddenAppFeaturesAdmin(uid),
        fetchPrivilegeStatsForUser(uid),
      ]);
      setHiddenIds(new Set(hideRows.map((r) => Array.isArray(r.feature_id) ? r.feature_id[0] : r.feature_id)));
      setStats(statsResult);
    } finally {
      setLoadingHidden(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setHiddenIds(new Set());
      setStats(ZERO_STATS);
      return;
    }
    loadUserData(selectedUser.id);
  }, [selectedUser, loadUserData]);

  // ── User picker modal ─────────────────────────────────────────────
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

  // ── Toggle a feature for the current selectedUser ─────────────────
  const handleToggle = useCallback(async (feature, nextHidden) => {
    if (!selectedUser) return;
    const fid = feature.id;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (nextHidden) next.add(fid); else next.delete(fid);
      return next;
    });
    setSavingIds((prev) => new Set(prev).add(fid));
    try {
      await setAppFeatureHiddenForUser(selectedUser.id, fid, nextHidden);
      // Re-pull stats so the HIDDEN APPS / etc tiles reflect any side effects.
      try {
        const fresh = await fetchPrivilegeStatsForUser(selectedUser.id);
        setStats(fresh);
      } catch (_) {}
      const currentUid = authUser?.uid || authUser?.id;
      if (currentUid && Number(currentUid) === Number(selectedUser.id)) {
        try { await useAuthStore.getState().refreshHiddenFeatures(currentUid); } catch (_) {}
      }
    } catch (err) {
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

  // ── Build the grouped flat list for FlatList ──────────────────────
  // Output items: { kind: 'header', groupKey, groupLabel, total, hiddenCount }
  //         or:  { kind: 'feature', ...feature }
  const flatList = useMemo(() => {
    if (!features || features.length === 0) return [];
    // Bucket features by group
    const buckets = new Map();
    for (const f of features) {
      const { groupKey, groupLabel } = groupOf(f);
      if (!buckets.has(groupKey)) {
        buckets.set(groupKey, { groupKey, groupLabel, items: [] });
      }
      buckets.get(groupKey).items.push(f);
    }
    // Stable order: by group label
    const ordered = Array.from(buckets.values()).sort((a, b) =>
      a.groupLabel.localeCompare(b.groupLabel));
    const out = [];
    for (const b of ordered) {
      const hiddenCount = b.items.filter((it) => hiddenIds.has(it.id)).length;
      out.push({
        kind: 'header',
        groupKey: b.groupKey,
        groupLabel: b.groupLabel,
        total: b.items.length,
        hiddenCount,
      });
      if (!collapsedGroups.has(b.groupKey)) {
        for (const it of b.items) out.push({ kind: 'feature', ...it });
      }
    }
    return out;
  }, [features, hiddenIds, collapsedGroups]);

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

  // ── Renderers ─────────────────────────────────────────────────────
  const renderFlatRow = ({ item }) => {
    if (item.kind === 'header') {
      const collapsed = collapsedGroups.has(item.groupKey);
      return (
        <TouchableOpacity
          style={styles.groupHeader}
          activeOpacity={0.7}
          onPress={() => toggleGroupCollapse(item.groupKey)}
        >
          <Icon
            name={collapsed ? 'chevron-right' : 'expand-more'}
            size={20}
            color="#475569"
          />
          <Icon name="folder" size={16} color={NAVY} style={{ marginRight: 6, marginLeft: 2 }} />
          <Text style={styles.groupHeaderLabel}>{item.groupLabel}</Text>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>
              {item.hiddenCount > 0
                ? `${item.hiddenCount} hidden · ${item.total}`
                : `${item.total}`}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    const feature = item;
    const isHidden = hiddenIds.has(feature.id);
    const isSaving = savingIds.has(feature.id);
    const accent = isHidden ? HIDDEN_ACCENT : VISIBLE_ACCENT;
    const pillBg = isHidden ? HIDDEN_BG : VISIBLE_BG;
    const subline = [feature.feature_key, feature.description]
      .filter(Boolean)
      .join('  ·  ');
    return (
      <View style={[styles.featureCard, { borderLeftColor: accent }]}>
        <View style={styles.featureCardLeft}>
          <View style={[styles.statusDot, { backgroundColor: accent }]} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.featureName} numberOfLines={1}>{feature.name}</Text>
            {subline ? (
              <Text style={styles.featureSubline} numberOfLines={2}>{subline}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.featureCardRight}>
          <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
            <Text style={[styles.statusPillText, { color: accent }]}>
              {isHidden ? 'Hidden' : 'Visible'}
            </Text>
          </View>
          <Switch
            value={isHidden}
            disabled={isSaving}
            onValueChange={(v) => handleToggle(feature, v)}
            trackColor={{ false: '#cbd5e1', true: '#fca5a5' }}
            thumbColor={isHidden ? HIDDEN_ACCENT : '#f8fafc'}
          />
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

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="App Features" onBackPress={() => navigation.goBack()} />
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
              <Text style={styles.pickerEmptySub}>Choose whose visibility you want to manage</Text>
            </View>
            <Icon name="chevron-right" size={24} color={MUTED} />
          </TouchableOpacity>
        )}

        {/* ── Stat tiles row (only when a user is picked) ── */}
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

        {selectedUser ? (
          <Text style={styles.hint}>Changes apply on the user's next login.</Text>
        ) : null}

        {/* ── Feature list / empty state ── */}
        {!selectedUser ? (
          <View style={styles.bigEmpty}>
            <Icon name="visibility-off" size={48} color="#cbd5e1" />
            <Text style={styles.bigEmptyTitle}>No user selected</Text>
            <Text style={styles.bigEmptySub}>
              Pick a user above to see the list of features you can hide for them.
            </Text>
          </View>
        ) : (
          <FlatList
            data={flatList}
            keyExtractor={(it) => it.kind === 'header' ? `h-${it.groupKey}` : `f-${it.id}`}
            renderItem={renderFlatRow}
            ListEmptyComponent={
              loadingFeatures ? null : (
                <View style={styles.bigEmpty}>
                  <Icon name="inbox" size={42} color="#cbd5e1" />
                  <Text style={styles.bigEmptyTitle}>No features defined yet</Text>
                  <Text style={styles.bigEmptySub}>
                    Create one in Odoo: Privilege Manager → App Features.
                  </Text>
                </View>
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={loadingHidden}
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

      <OverlayLoader visible={loadingFeatures && !features.length} />

      {/* ── Centered user picker popup ── */}
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
        <View style={styles.userPickerCard}>
          <View style={styles.pickerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="person-search" size={20} color={NAVY} />
              <Text style={styles.pickerTitle}>Select User</Text>
            </View>
            <TouchableOpacity
              onPress={() => setPickerOpen(false)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Icon name="close" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          </View>

          {/* Inline search input — no navy bg, blends with the popup card */}
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
                  <Text style={{ color: MUTED, textAlign: 'center' }}>
                    No users matched.
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
  // ── Selected-user card ────────────────────────────────────────────
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
    backgroundColor: '#eef2ff', borderRadius: 8,
    gap: 4,
  },
  changeBtnText: { fontSize: 12, color: NAVY, fontFamily: FONT_FAMILY.semiBold },

  // ── Empty picker entry ────────────────────────────────────────────
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

  // ── Stat tiles row ────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 12, marginTop: 10,
    gap: 8,
  },
  statTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  statNumber: {
    fontSize: 22, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold,
  },
  statLabel: {
    fontSize: 9, fontFamily: FONT_FAMILY.semiBold, letterSpacing: 0.4,
    marginTop: 4, textAlign: 'center',
  },

  hint: {
    fontSize: 11, color: MUTED, fontFamily: FONT_FAMILY.regular,
    marginHorizontal: 16, marginTop: 8, marginBottom: 6,
  },

  // ── Group header (sub-section) ────────────────────────────────────
  groupHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10, paddingHorizontal: 12,
    marginHorizontal: 12, marginTop: 12, marginBottom: 4,
    borderRadius: 10,
  },
  groupHeaderLabel: {
    fontSize: 13, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold,
    flex: 1, letterSpacing: 0.2,
  },
  groupBadge: {
    backgroundColor: '#fff',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  groupBadgeText: { fontSize: 10, color: '#475569', fontFamily: FONT_FAMILY.semiBold },

  // ── Feature row ───────────────────────────────────────────────────
  featureCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14, borderRadius: 14,
    marginHorizontal: 12, marginVertical: 5,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  featureCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  featureCardRight: { alignItems: 'center', marginLeft: 12, gap: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  featureName: { fontSize: 15, color: '#0f172a', fontFamily: FONT_FAMILY.semiBold },
  featureSubline: { fontSize: 11, color: MUTED, marginTop: 3, fontFamily: FONT_FAMILY.regular },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillText: { fontSize: 10, fontFamily: FONT_FAMILY.semiBold, letterSpacing: 0.3 },

  // ── No-user empty state ───────────────────────────────────────────
  bigEmpty: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingVertical: 48,
  },
  bigEmptyTitle: { fontSize: 15, color: '#475569', marginTop: 12, fontFamily: FONT_FAMILY.semiBold },
  bigEmptySub: { fontSize: 12, color: MUTED, marginTop: 6, textAlign: 'center', fontFamily: FONT_FAMILY.regular },

  // ── Centered user-picker modal ────────────────────────────────────
  modalRoot: { justifyContent: 'center', alignItems: 'center', margin: 0 },
  userPickerCard: {
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

  // ── Inline search bar inside modal (no navy bg) ───────────────────
  pickerSearchWrap: { paddingHorizontal: 12, paddingVertical: 10 },
  pickerSearchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    gap: 8,
  },
  pickerSearchInput: {
    flex: 1, padding: 0,
    fontFamily: FONT_FAMILY.regular, fontSize: 14, color: '#0f172a',
  },

  pickerLoading: { alignItems: 'center', padding: 24, gap: 8 },
  pickerLoadingText: { fontSize: 12, color: MUTED, fontFamily: FONT_FAMILY.regular },

  // ── User row inside picker ────────────────────────────────────────
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

export default AppFeaturesScreen;
