import React, { useEffect, useCallback, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import useDataFetching from '@hooks/useDataFetching';
import { fetchAllAppBannersOdoo } from '@api/services/generalApi';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';
const SOFT_BG = '#F5F6FA';

const BannersScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);
  const [isAdmin, setIsAdmin] = useState(false);
  const { data, loading, fetchData } = useDataFetching(fetchAllAppBannersOdoo);

  const hasLoadedRef = useRef(false);

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
      // Always refetch on focus so create/edit/delete results appear
      // immediately when the form pops back.
      console.log('[AppBanner] list focus refresh, fetching…');
      fetchData();
      hasLoadedRef.current = true;
    }, [isAdmin])
  );

  useEffect(() => {
    if (hasLoadedRef.current) {
      console.log(`[AppBanner] list rendered with rows=${data?.length ?? 0}, loading=${loading}`);
    }
  }, [data, loading]);

  const renderItem = useCallback(({ item }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('BannerDetails', { mode: 'edit', banner: item })}
    >
      {item.image ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${item.image}` }}
          style={styles.thumb}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="image-not-supported" size={24} color={MUTED} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {item.name || `Banner #${item.id}`}
          </Text>
          <View
            style={[styles.dot, item.active ? styles.dotOn : styles.dotOff]}
          />
        </View>
        <Text style={styles.meta}>Sequence {item.sequence}</Text>
        <Text style={[styles.meta, item.active ? styles.activeOn : styles.activeOff]}>
          {item.active ? 'Active' : 'Inactive'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.cropBtn}
        onPress={(e) => {
          // Stop the row's onPress from also firing.
          e.stopPropagation?.();
          navigation.navigate('BannerDetails', { mode: 'edit', banner: item, autoCrop: true });
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Icon name="crop" size={20} color={NAVY} />
      </TouchableOpacity>
      <Icon name="chevron-right" size={22} color="#C9CDD6" />
    </TouchableOpacity>
  ), [navigation]);

  const keyExtractor = useCallback((item, index) => `banner-${item.id || index}`, []);

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={SOFT_BG}>
        <NavigationHeader title="App Banners" onBackPress={() => navigation.goBack()} />
        <View style={styles.center}>
          <Icon name="lock" size={64} color="#ccc" />
          <Text style={styles.deniedTitle}>Access Denied</Text>
          <Text style={styles.deniedSub}>Only administrators can manage banners</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderList = () => {
    if (loading && (!data || data.length === 0) && !hasLoadedRef.current) return null;
    if ((!data || data.length === 0) && !loading) {
      return (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty_data.png')}
          message="No banners yet — tap + to add one"
        />
      );
    }
    return (
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={108}
      />
    );
  };

  return (
    <SafeAreaView backgroundColor={SOFT_BG}>
      <NavigationHeader title="App Banners" onBackPress={() => navigation.goBack()} />
      <View style={{ flex: 1 }}>{renderList()}</View>
      <FeatureGate featureKey="app_banners.add">
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('BannerDetails', { mode: 'create' })}
          activeOpacity={0.85}
        >
          <Icon name="add-photo-alternate" size={22} color="#fff" />
          <Text style={styles.fabText}>New Banner</Text>
        </TouchableOpacity>
      </FeatureGate>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default BannersScreen;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  deniedTitle: { fontSize: 22, color: '#666', marginTop: 18, fontFamily: FONT_FAMILY.urbanistBold },
  deniedSub: {
    fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center', paddingHorizontal: 40,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  thumb: {
    width: 84,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#000',
    resizeMode: 'cover',
  },
  thumbEmpty: {
    backgroundColor: '#F1F2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, marginLeft: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: 14, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold, flexShrink: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: '#22C55E' },
  dotOff: { backgroundColor: '#9CA3AF' },
  meta: { fontSize: 12, color: MUTED, fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2 },
  activeOn: { color: '#16a34a' },
  activeOff: { color: '#9CA3AF' },
  cropBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    marginRight: 4,
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
  fabText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 13, letterSpacing: 0.4 },
});
