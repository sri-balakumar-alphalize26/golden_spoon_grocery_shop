import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { fetchUsersOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { OverlayLoader } from '@components/Loader';
import { SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';
const SOFT_BG = '#F5F6FA';

// Pastel tints for the avatar bubble — keyed off the user id so the
// same person keeps the same colour across renders.
const AVATAR_TINTS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#fed7aa', '#ddd6fe', '#fecaca'];
const tintFor = (id) => AVATAR_TINTS[Math.abs(Number(id) || 0) % AVATAR_TINTS.length];

const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

const UsersScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);
  const [isAdmin, setIsAdmin] = useState(false);
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchUsersOdoo);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  const hasLoadedRef = useRef(false);
  const lastParamsRef = useRef({ searchText: '' });
  const hasAttemptedFetchRef = useRef(false);

  // Admin guard — only uid 2 / is_admin / is_superuser can see the list.
  useEffect(() => {
    const checkAdmin = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(checkAdmin);

    if (!checkAdmin) {
      Toast.show({
        type: 'error',
        text1: 'Access Denied',
        text2: 'Only administrators can access this feature',
      });
      setTimeout(() => navigation.goBack(), 2000);
    }
  }, [authUser, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return;
      const paramsChanged = lastParamsRef.current.searchText !== searchText;
      if (!hasLoadedRef.current || paramsChanged) {
        hasAttemptedFetchRef.current = true;
        fetchData({ searchText });
        hasLoadedRef.current = true;
        lastParamsRef.current = { searchText };
      } else {
        // Refresh on focus so a returning create/edit reflects in the list.
        fetchData({ searchText });
      }
    }, [searchText, isAdmin])
  );

  const handleLoadMore = useCallback(() => {
    fetchMoreData({ searchText });
  }, [searchText, fetchMoreData]);

  // Build a flat list with synthetic header rows so the FlashList
  // renders two sections: ADMINISTRATORS first, then USERS.
  const sectionedData = useMemo(() => {
    const admins = data.filter((u) => u._isAdmin);
    const others = data.filter((u) => !u._isAdmin);
    const out = [];
    if (admins.length > 0) {
      out.push({ _kind: 'header', label: 'ADMINISTRATORS', count: admins.length });
      for (const u of admins) out.push({ _kind: 'user', ...u });
    }
    if (others.length > 0) {
      out.push({ _kind: 'header', label: 'USERS', count: others.length });
      for (const u of others) out.push({ _kind: 'user', ...u });
    }
    return out;
  }, [data]);

  const renderRow = useCallback(({ item }) => {
    if (item._kind === 'header') {
      return (
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
          <Text style={styles.sectionHeaderCount}>{item.count}</Text>
        </View>
      );
    }
    const tint = tintFor(item.id);
    const initial = initialOf(item.name);
    return (
      <TouchableOpacity
        style={styles.userCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('UserDetails', { mode: 'edit', user: item })}
      >
        <View style={[styles.avatar, { backgroundColor: tint }]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
            {item._isAdmin ? (
              <View style={styles.adminBadge}>
                <Icon name="shield" size={10} color="#fff" />
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
            ) : null}
            <View style={[styles.statusDot, item.active ? styles.dotActive : styles.dotInactive]} />
          </View>
          <View style={styles.metaRow}>
            <Icon name="alternate-email" size={13} color={MUTED} />
            <Text style={styles.userMeta} numberOfLines={1}>{item.login}</Text>
          </View>
          {item.email ? (
            <View style={styles.metaRow}>
              <Icon name="mail-outline" size={13} color={MUTED} />
              <Text style={styles.userMeta} numberOfLines={1}>{item.email}</Text>
            </View>
          ) : null}
          {item.phone ? (
            <View style={styles.metaRow}>
              <Icon name="phone" size={13} color={MUTED} />
              <Text style={styles.userMeta} numberOfLines={1}>{item.phone}</Text>
            </View>
          ) : null}
        </View>
        <Icon name="chevron-right" size={22} color="#C9CDD6" />
      </TouchableOpacity>
    );
  }, [navigation]);

  const keyExtractor = useCallback((item, index) => {
    if (item._kind === 'header') return `hdr-${item.label}-${index}`;
    return `user-${item.id || index}`;
  }, []);

  const getItemType = useCallback((item) => item._kind, []);

  const renderEmptyState = useCallback(() => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty_data.png')}
      message="No users found"
    />
  ), []);

  const renderUsers = () => {
    if (loading && data.length === 0 && hasAttemptedFetchRef.current) {
      return null;
    }
    if (data.length === 0 && !loading && hasAttemptedFetchRef.current) {
      return renderEmptyState();
    }
    if (data.length > 0) {
      return (
        <FlashList
          data={sectionedData}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
          onEndReached={handleLoadMore}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          estimatedItemSize={96}
          removeClippedSubviews
        />
      );
    }
    return null;
  };

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={SOFT_BG}>
        <NavigationHeader
          title="Users"
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.accessDeniedContainer}>
          <Icon name="lock" size={64} color="#ccc" />
          <Text style={styles.accessDeniedText}>Access Denied</Text>
          <Text style={styles.accessDeniedSubtext}>
            Only administrators can access this feature
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const headerCount = data.length
    ? `${data.length}${data.length === 1 ? ' user' : ' users'}`
    : '';

  return (
    <SafeAreaView backgroundColor={SOFT_BG}>
      <NavigationHeader
        title="Users"
        onBackPress={() => navigation.goBack()}
      />
      <SearchContainer
        placeholder="Search by name or login"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      {headerCount ? (
        <View style={styles.countRow}>
          <Text style={styles.countText}>{headerCount}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{renderUsers()}</View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('UserDetails', { mode: 'create' })}
        activeOpacity={0.85}
      >
        <Icon name="person-add-alt-1" size={22} color="#fff" />
        <Text style={styles.fabText}>New User</Text>
      </TouchableOpacity>

      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  countRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  countText: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.8,
  },
  sectionHeaderCount: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NAVY,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    gap: 3,
  },
  adminBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    fontSize: 20,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 15,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    flexShrink: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#22C55E',
  },
  dotInactive: {
    backgroundColor: '#9CA3AF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 5,
  },
  userMeta: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    flexShrink: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: NAVY,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: NAVY, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  fabText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  accessDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  accessDeniedText: {
    fontSize: 22,
    color: '#666',
    marginTop: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  accessDeniedSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default UsersScreen;
