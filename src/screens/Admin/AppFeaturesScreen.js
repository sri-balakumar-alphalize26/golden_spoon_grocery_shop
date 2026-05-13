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
// Toggles are buffered locally. A Save button appears in the top-right of
// the header whenever there are unsaved changes; tapping it commits them
// all in one batch. The user picker is a centered RNModal popup matching
// the in-app convention (LogoutModal etc.).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  fetchAppFeaturesOdoo,
  fetchHiddenAppFeaturesAdmin,
  fetchPrivilegeStatsForUser,
  setAppFeatureHiddenForUser,
  clearAllHidesForUser,
  hideAllFeaturesForUser,
} from '@api/services/generalApi';
import ConfirmModal from '@components/Modal/ConfirmModal';
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

// Apps Privileges admin only cares about the "App Hidden Feature" count.
// The other 4 (groups/modules/hidden_menus/hidden_apps) live on the
// Module Privileges screen + the OWL dashboard, where they make sense.
const STAT_TILES = [
  { key: 'hidden_features', label: 'APP HIDDEN FEATURE', accent: '#9333ea' },
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

  // Snapshot of `hiddenIds` as it was when modules were last fetched. Lets
  // us detect "toggled back to original" and accurately drive the Save (N)
  // counter — we only consider feature_ids whose current state diverges.
  // State (not a ref) so the dirty-state useMemo is guaranteed to recompute
  // when the snapshot changes — a stale ref read had been making the Save
  // button persist after a successful save.
  const [originalHiddenIds, setOriginalHiddenIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Collapsed group keys (Set of groupKey strings). Default empty = all expanded.
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  // Parent feature ids that are currently expanded (revealing nested children).
  // Default empty = all collapsed; tap the chevron to reveal sub-rows.
  const [expandedParents, setExpandedParents] = useState(new Set());
  // Generic confirm popup state (replaces Alert.alert across the screen).
  // Set via askConfirm({...}); cleared via cancel/confirm or closeConfirm().
  const [confirmModal, setConfirmModal] = useState(null);

  const askConfirm = useCallback((opts) => {
    console.log('[AppsPriv] askConfirm', { title: opts?.title });
    setConfirmModal(opts);
  }, []);
  const closeConfirm = useCallback(() => setConfirmModal(null), []);

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
  // Also snapshots the loaded hidden-set so the Save (N) counter can
  // distinguish buffered changes from the server state.
  const loadUserData = useCallback(async (uid) => {
    setLoadingHidden(true);
    try {
      const [hideRows, statsResult] = await Promise.all([
        fetchHiddenAppFeaturesAdmin(uid),
        fetchPrivilegeStatsForUser(uid),
      ]);
      const ids = new Set(
        hideRows.map((r) => Array.isArray(r.feature_id) ? r.feature_id[0] : r.feature_id),
      );
      setHiddenIds(ids);
      // Fresh-loaded server state becomes the new "original" — buffered
      // changes from before this load are implicitly discarded.
      setOriginalHiddenIds(new Set(ids));
      setStats(statsResult);
    } finally {
      setLoadingHidden(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setHiddenIds(new Set());
      setOriginalHiddenIds(new Set());
      setStats(ZERO_STATS);
      return;
    }
    loadUserData(selectedUser.id);
  }, [selectedUser, loadUserData]);

  // Buffered-changes derivation: feature ids whose current hidden state
  // diverges from the originally-loaded snapshot.
  const pendingFeatureIds = useMemo(() => {
    const pending = new Set();
    // Look at every id present in either set so we catch both "newly hidden"
    // and "newly un-hidden" cases.
    const union = new Set([...originalHiddenIds, ...hiddenIds]);
    for (const id of union) {
      if (originalHiddenIds.has(id) !== hiddenIds.has(id)) pending.add(id);
    }
    return pending;
  }, [hiddenIds, originalHiddenIds]);
  const pendingCount = pendingFeatureIds.size;

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

  // ── Buffered toggle ───────────────────────────────────────────────
  // Flip the local hiddenIds; the Save button picks this up via
  // pendingFeatureIds. No RPC fires here.
  const handleToggle = useCallback((feature, nextHidden) => {
    if (!selectedUser) return;
    const fid = feature.id;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (nextHidden) next.add(fid); else next.delete(fid);
      return next;
    });
  }, [selectedUser]);

  // ── Save / Discard ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedUser || pendingCount === 0 || saving) return;
    setSaving(true);
    const tasks = [];
    for (const fid of pendingFeatureIds) {
      const nextHidden = hiddenIds.has(fid);
      tasks.push(setAppFeatureHiddenForUser(selectedUser.id, fid, nextHidden));
    }
    try {
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        Toast.show({
          type: 'error',
          text1: 'Some changes failed',
          text2: `${failed.length} of ${results.length} writes failed. Try again.`,
        });
      } else {
        Toast.show({ type: 'success', text1: 'Saved' });
      }
      // Re-pull authoritative server state — refreshes stats and resets the
      // originals snapshot, which clears pendingFeatureIds.
      await loadUserData(selectedUser.id);
      // If the admin is editing their own user, refresh the gating cache so
      // changes apply in the current session without a re-login.
      const currentUid = authUser?.uid || authUser?.id;
      if (currentUid && Number(currentUid) === Number(selectedUser.id)) {
        try { await useAuthStore.getState().refreshHiddenFeatures(currentUid); } catch (_) {}
      }
    } finally {
      setSaving(false);
    }
  }, [selectedUser, pendingCount, pendingFeatureIds, hiddenIds, saving, loadUserData, authUser]);

  const handleDiscard = useCallback(() => {
    if (pendingCount === 0) return;
    askConfirm({
      title: 'Discard unsaved changes?',
      message: `You have ${pendingCount} feature${pendingCount === 1 ? '' : 's'} with unsaved visibility changes.`,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
      onConfirm: () => {
        console.log('[AppsPriv] ConfirmModal confirm', { title: 'Discard unsaved changes?' });
        closeConfirm();
        if (selectedUser) loadUserData(selectedUser.id);
      },
    });
  }, [pendingCount, selectedUser, loadUserData, askConfirm, closeConfirm]);

  // ── Bulk action: Hide All ────────────────────────────────────────
  // Replaces the previous "Full Permission" (which un-hid everything).
  // Now: bulk-hides every defined app.feature for the selected user.
  const handleHideAll = useCallback(() => {
    console.log('[AppsPriv] Hide All tap', { user: selectedUser?.id, saving });
    if (!selectedUser || saving) return;
    askConfirm({
      title: 'Hide every feature?',
      message: `Mark every defined feature as hidden for ${selectedUser.name}. On their next login every gated UI element disappears.`,
      confirmLabel: 'Hide all',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        console.log('[AppsPriv] ConfirmModal confirm', { title: 'Hide every feature?' });
        closeConfirm();
        setSaving(true);
        try {
          const total = await hideAllFeaturesForUser(selectedUser.id);
          console.log('[AppsPriv] Hide All result', { total });
          await loadUserData(selectedUser.id);
          Toast.show({
            type: 'success',
            text1: 'All features hidden',
            text2: `${total} feature${total === 1 ? '' : 's'} hidden for ${selectedUser.name}`,
          });
        } catch (err) {
          console.warn('[AppsPriv] Hide All failed', err?.message || err);
          Toast.show({
            type: 'error',
            text1: 'Could not hide all',
            text2: err?.message || 'Server error',
          });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [selectedUser, saving, loadUserData, askConfirm, closeConfirm]);

  // Reset All — inverse of Hide All. Bulk-clear every hide for the
  // selected user so they see every gated element again on next login.
  // Routes through the existing `clear_all_hides_for_user` RPC.
  const handleResetAll = useCallback(() => {
    console.log('[AppsPriv] Reset All tap', { user: selectedUser?.id, pendingCount, saving });
    if (!selectedUser || saving) return;
    askConfirm({
      title: 'Reset all hides?',
      message: `Clear every hide for ${selectedUser.name}. Their next login will show every gated UI element again.`,
      confirmLabel: 'Reset all',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        console.log('[AppsPriv] ConfirmModal confirm', { title: 'Reset all hides?' });
        closeConfirm();
        setSaving(true);
        try {
          const removed = await clearAllHidesForUser(selectedUser.id);
          console.log('[AppsPriv] Reset All result', { removed });
          await loadUserData(selectedUser.id);
          Toast.show({
            type: 'success',
            text1: 'All hides cleared',
            text2: removed > 0
              ? `${removed} hide${removed === 1 ? '' : 's'} removed for ${selectedUser.name}`
              : `${selectedUser.name} already had no hides`,
          });
        } catch (err) {
          console.warn('[AppsPriv] Reset All failed', err?.message || err);
          Toast.show({
            type: 'error',
            text1: 'Could not clear hides',
            text2: err?.message || 'Server error',
          });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [selectedUser, saving, pendingCount, loadUserData, askConfirm, closeConfirm]);

  // Intercept Back press when there are pending changes — standard React
  // Navigation pattern so an admin doesn't silently lose work.
  useEffect(() => {
    if (pendingCount === 0) return undefined;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (saving) return; // let the save complete naturally
      e.preventDefault();
      askConfirm({
        title: 'Discard unsaved changes?',
        message: `You have ${pendingCount} feature${pendingCount === 1 ? '' : 's'} with unsaved visibility changes.`,
        confirmLabel: 'Discard & leave',
        cancelLabel: 'Keep editing',
        destructive: true,
        onConfirm: () => {
          console.log('[AppsPriv] ConfirmModal confirm', { title: 'Discard & leave' });
          closeConfirm();
          navigation.dispatch(e.data.action);
        },
      });
    });
    return unsubscribe;
  }, [navigation, pendingCount, saving, askConfirm, closeConfirm]);

  // ── Build the grouped flat list for FlatList ──────────────────────
  // Output items: { kind: 'header', groupKey, groupLabel, total, hiddenCount }
  //         or:  { kind: 'feature', ...feature, _hasChildren?, _isChild? }
  // Features with parent_id are pulled out of prefix-grouping and rendered
  // as indented sub-rows directly under their parent (when the parent is
  // expanded). Top-level features still group by dotted prefix as before.
  const flatList = useMemo(() => {
    if (!features || features.length === 0) return [];
    const parentIdOf = (f) => (Array.isArray(f.parent_id) ? f.parent_id[0] : f.parent_id) || null;
    const childrenOf = new Map();
    for (const f of features) {
      const pid = parentIdOf(f);
      if (pid) {
        if (!childrenOf.has(pid)) childrenOf.set(pid, []);
        childrenOf.get(pid).push(f);
      }
    }
    const topLevel = features.filter((f) => !parentIdOf(f));
    const buckets = new Map();
    for (const f of topLevel) {
      const { groupKey, groupLabel } = groupOf(f);
      if (!buckets.has(groupKey)) {
        buckets.set(groupKey, { groupKey, groupLabel, items: [] });
      }
      buckets.get(groupKey).items.push(f);
    }
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
      if (collapsedGroups.has(b.groupKey)) continue;
      for (const it of b.items) {
        const kids = childrenOf.get(it.id) || [];
        out.push({ kind: 'feature', ...it, _hasChildren: kids.length > 0, _childCount: kids.length });
        if (kids.length > 0 && expandedParents.has(it.id)) {
          for (const c of kids) out.push({ kind: 'feature', ...c, _isChild: true });
        }
      }
    }
    console.log('[FeatureAdmin] flatList:',
      'childrenOf=', Array.from(childrenOf.entries()).map(([pid, kids]) =>
        ({ pid, count: kids.length, keys: kids.map((k) => k.feature_key) })),
      'rows=', out.filter((r) => r.kind === 'feature').map((r) =>
        ({ id: r.id, key: r.feature_key, has: r._hasChildren, child: r._isChild })));
    return out;
  }, [features, hiddenIds, collapsedGroups, expandedParents]);

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const toggleParentExpand = (parentId) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
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
    const isDirty = pendingFeatureIds.has(feature.id);
    // When a row has unsaved changes, swap the green/red state border for an
    // amber dirty border so the admin sees at a glance what they've touched.
    const accent = isHidden ? HIDDEN_ACCENT : VISIBLE_ACCENT;
    const borderColor = isDirty ? '#f59e0b' : accent;
    const pillBg = isHidden ? HIDDEN_BG : VISIBLE_BG;
    const subline = [feature.feature_key, feature.description]
      .filter(Boolean)
      .join('  ·  ');
    const isExpanded = expandedParents.has(feature.id);
    return (
      <View style={[
        styles.featureCard,
        { borderLeftColor: borderColor },
        isDirty && styles.featureCardDirty,
        feature._isChild && styles.featureCardChild,
      ]}>
        {feature._hasChildren ? (
          <TouchableOpacity
            onPress={() => toggleParentExpand(feature.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.expandChevron}
          >
            <Icon
              name={isExpanded ? 'expand-more' : 'chevron-right'}
              size={22}
              color={NAVY}
            />
          </TouchableOpacity>
        ) : null}
        <View style={styles.featureCardLeft}>
          <View style={[styles.statusDot, { backgroundColor: accent }]} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.featureName} numberOfLines={1}>{feature.name}</Text>
              {feature._hasChildren ? (
                <View style={styles.subCountPill}>
                  <Text style={styles.subCountPillText}>{feature._childCount} options</Text>
                </View>
              ) : null}
              {isDirty ? <View style={styles.dirtyDot} /> : null}
            </View>
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
            disabled={saving}
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
      <NavigationHeader
        title="Apps Privileges"
        onBackPress={() => navigation.goBack()}
        saveLabel={pendingCount > 0 ? (saving ? 'Saving…' : `Save (${pendingCount})`) : undefined}
        onSavePress={handleSave}
      />
      {pendingCount > 0 ? (
        <TouchableOpacity
          style={styles.pendingBar}
          onPress={handleDiscard}
          activeOpacity={0.8}
          disabled={saving}
        >
          <Icon name="info-outline" size={16} color="#92400e" />
          <Text style={styles.pendingBarText}>
            {pendingCount} feature{pendingCount === 1 ? '' : 's'} with unsaved changes
          </Text>
          <Text style={styles.pendingBarDiscard}>Discard</Text>
        </TouchableOpacity>
      ) : null}
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

        {/* ── Stat tile (single banner since this admin only cares about
             the App Hidden Feature count) ── */}
        {selectedUser ? (
          <View style={styles.statsRow}>
            {STAT_TILES.map((t) => (
              <View key={t.key} style={[styles.statBannerSingle, { borderColor: t.accent }]}>
                <View style={[styles.statBannerIconWrap, { backgroundColor: t.accent + '22' }]}>
                  <Icon name="visibility-off" size={20} color={t.accent} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.statBannerLabel, { color: t.accent }]}>{t.label}</Text>
                  <Text style={styles.statBannerSub}>Hidden for this user</Text>
                </View>
                <Text style={[styles.statBannerNumber, { color: t.accent }]}>
                  {stats[t.key] ?? 0}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {selectedUser ? (
          <Text style={styles.hint}>Visibility changes apply on the user's next login.</Text>
        ) : null}

        {/* ── Bulk action row (mirrors Module Privileges header) ── */}
        {selectedUser ? (
          <View style={styles.bulkActionRow}>
            <TouchableOpacity
              style={[styles.bulkActionBtn, styles.bulkActionBtnDangerFilled, saving && { opacity: 0.6 }]}
              onPress={handleHideAll}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Icon name="visibility-off" size={16} color="#fff" />
              <Text style={styles.bulkActionBtnTextPrimary}>Hide All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionBtn, styles.bulkActionBtnDanger, saving && { opacity: 0.6 }]}
              onPress={handleResetAll}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Icon name="restart-alt" size={16} color="#dc2626" />
              <Text style={styles.bulkActionBtnTextDanger}>Reset All</Text>
            </TouchableOpacity>
          </View>
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

      {/* ── Generic confirm popup (shared by Hide All / Reset All / Discard / Back) ── */}
      <ConfirmModal
        isVisible={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmLabel={confirmModal?.confirmLabel}
        cancelLabel={confirmModal?.cancelLabel}
        destructive={confirmModal?.destructive}
        onConfirm={confirmModal?.onConfirm}
        onCancel={closeConfirm}
      />
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

  // ── Stat banner (single tile since this admin only shows hidden_features) ──
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 12, marginTop: 10,
    gap: 8,
  },
  statBannerSingle: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  statBannerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  statBannerLabel: {
    fontSize: 11, fontFamily: FONT_FAMILY.semiBold, letterSpacing: 0.4,
  },
  statBannerSub: {
    fontSize: 11, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.regular,
  },
  statBannerNumber: {
    fontSize: 28, fontFamily: FONT_FAMILY.semiBold, marginLeft: 8,
  },

  // ── Bulk action row (Full Permission / Reset All) ─────────────────
  bulkActionRow: {
    flexDirection: 'row',
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    gap: 8,
  },
  bulkActionBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  bulkActionBtnDangerFilled: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
  bulkActionBtnTextPrimary: {
    color: '#fff', fontSize: 13, fontFamily: FONT_FAMILY.semiBold, letterSpacing: 0.2,
  },
  bulkActionBtnDanger: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  bulkActionBtnTextDanger: {
    color: '#dc2626', fontSize: 13, fontFamily: FONT_FAMILY.semiBold, letterSpacing: 0.2,
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

  // ── Pending-changes banner (under header while pendingCount > 0) ──
  pendingBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#fde68a',
    gap: 8,
  },
  pendingBarText: { flex: 1, fontSize: 12, color: '#92400e', fontFamily: FONT_FAMILY.semiBold },
  pendingBarDiscard: { fontSize: 12, color: '#b91c1c', fontFamily: FONT_FAMILY.semiBold, textDecorationLine: 'underline' },

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
  featureCardDirty: {
    backgroundColor: '#fffbeb',
  },
  featureCardChild: {
    marginLeft: 28,
  },
  expandChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  subCountPill: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  subCountPillText: {
    fontSize: 10,
    color: NAVY,
    fontFamily: FONT_FAMILY.semiBold,
    letterSpacing: 0.2,
  },
  dirtyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },
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
