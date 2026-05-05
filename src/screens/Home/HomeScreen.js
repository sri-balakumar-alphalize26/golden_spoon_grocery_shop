import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { CarouselPagination, Header } from '@components/Home';
import { SafeAreaView } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useLoader } from '@hooks';
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from '@components/Loader';

const ACTIONS = [
  { key: 'POSRegister', label: 'POS', icon: require('@assets/images/Home/section/possss.png') },
  { key: 'SalesReport', label: 'Sales Report', icon: require('@assets/images/Home/section/salesreportbtn.png') },
  { key: 'Products', label: 'Products', icon: require('@assets/images/Home/section/productsbutton.png') },
  { key: 'UsersScreen', label: 'Users', icon: require('@assets/images/Home/section/userbtnhome.png') },
  { key: 'MyOrdersScreen', label: 'Orders', icon: require('@assets/images/Home/section/ordersbtnhome.png') },
];

const HomeScreen = ({ navigation }) => {
  const [backPressCount, setBackPressCount] = useState(0);
  const authUser = useAuthStore((s) => s.user);
  const [detailLoading] = useLoader(false);

  const handleBackPress = useCallback(() => {
    if (navigation.isFocused()) {
      if (backPressCount === 0) {
        setBackPressCount(1);
        return true;
      } else if (backPressCount === 1) {
        BackHandler.exitApp();
      }
    }
    return false;
  }, [backPressCount, navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [handleBackPress]);

  useEffect(() => {
    const t = setTimeout(() => setBackPressCount(0), 2000);
    return () => clearTimeout(t);
  }, [backPressCount]);

  useEffect(() => {
    if (backPressCount === 1) showToastMessage('Press back again to exit');
  }, [backPressCount]);

  useEffect(() => {
    if (authUser) {
      const uid = authUser.uid || authUser.id || null;
      const uname = authUser.name || authUser.username || authUser.partner_display_name || null;
      console.log('[AUTH] current user id:', uid, 'name:', uname);
    } else {
      console.log('[AUTH] no authenticated user');
    }
  }, [authUser]);

  const navigateToScreen = (screenName) => {
    if (screenName === 'UsersScreen') {
      const isAdmin =
        authUser?.uid === 2 ||
        authUser?.is_admin === true ||
        authUser?.is_superuser === true;
      if (!isAdmin) {
        showToastMessage('Only administrators can access this feature');
        return;
      }
    }
    navigation.navigate(screenName);
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const userName =
    authUser?.related_profile?.name ||
    authUser?.user_name ||
    authUser?.username ||
    authUser?.name ||
    'there';

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <View style={styles.root}>
        <Header />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.greetingCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greetingHello}>{greeting},</Text>
              <Text style={styles.greetingName} numberOfLines={1}>
                {userName}
              </Text>
            </View>
            <View style={styles.greetingBadge}>
              <Text style={styles.greetingBadgeText}>369</Text>
            </View>
          </View>

          <View style={styles.carouselWrapper}>
            <CarouselPagination />
          </View>

          <View style={styles.gridSection}>
            <Text style={styles.gridTitle}>Quick Actions</Text>
            <View style={styles.grid}>
              {ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  onPress={() => navigateToScreen(action.key)}
                  activeOpacity={0.85}
                  style={styles.actionCard}
                >
                  <View style={styles.iconCircle}>
                    <Image source={action.icon} style={styles.actionIcon} resizeMode="contain" />
                  </View>
                  <Text style={styles.actionLabel} numberOfLines={1}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        <Text style={styles.poweredText}>Powered by 369ai | v1.0.0</Text>
        <OverlayLoader visible={detailLoading} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F4F8' },
  scrollContent: { paddingBottom: 90 },

  greetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  greetingHello: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.gray },
  greetingName: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginTop: 2,
  },
  greetingBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryThemeColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.5,
  },

  carouselWrapper: { marginTop: 14, marginBottom: 4 },

  gridSection: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingBottom: 24,
    paddingHorizontal: 14,
    minHeight: 280,
  },
  gridTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 14,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  actionCard: {
    width: '33.333%',
    paddingHorizontal: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#F4EEFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E5DAF7',
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#461c8a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4 },
    }),
  },
  actionIcon: { width: 38, height: 38 },
  actionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
    textAlign: 'center',
  },

  poweredText: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#A8A8B3',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default HomeScreen;
