import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  BackHandler,
  ScrollView,
  TouchableOpacity,
  Platform,
  Text,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CarouselPagination } from '@components/Home';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from '@components/Loader';
import { useLoader } from '@hooks';
import { version as appVersion } from '../../../package.json';

const SECTIONS = [
  {
    title: 'Sales & POS',
    icon: 'point-of-sale',
    accent: '#00BCD4',
    items: [
      { id: 'pos', title: 'POS', screen: 'POSRegister', icon: require('@assets/images/Home/section/possss.png'), bg: '#E0F7FA', accent: '#00BCD4' },
      { id: 'orders', title: 'Orders', screen: 'MyOrdersScreen', icon: require('@assets/images/Home/section/ordersbtnhome.png'), bg: '#E3F2FD', accent: '#2196F3' },
      { id: 'salesreport', title: 'Sales Report', screen: 'SalesReport', icon: require('@assets/images/Home/section/salesreportbtn.png'), bg: '#F3E5F5', accent: '#9C27B0' },
    ],
  },
  {
    title: 'Inventory',
    icon: 'inventory-2',
    accent: '#FF9800',
    items: [
      { id: 'products', title: 'Products', screen: 'Products', icon: require('@assets/images/Home/section/productsbutton.png'), bg: '#FFF3E0', accent: '#FF9800' },
    ],
  },
  {
    title: 'Easy Purchase',
    icon: 'shopping-cart-checkout',
    accent: '#0EA5E9',
    items: [
      { id: 'easy-purchase', title: 'Easy Purchase', screen: 'EasyPurchaseList', icon: require('@assets/images/Home/section/easypurchase.png'), bg: '#E0F2FE', accent: '#0284C7' },
    ],
  },
  {
    title: 'Administration',
    icon: 'admin-panel-settings',
    accent: '#9C27B0',
    items: [
      { id: 'users', title: 'Users', screen: 'UsersScreen', icon: require('@assets/images/Home/section/userbtnhome.png'), bg: '#F3E5F5', accent: '#9C27B0', requiresAdmin: true },
    ],
  },
];

const padItems = (items) => {
  if (items.length % 2 === 0) return items;
  return [...items, { id: `blank-${items[0]?.id || 'x'}`, empty: true }];
};

const HomeScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [backPressCount, setBackPressCount] = useState(0);
  const [detailLoading] = useLoader(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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

  const handleCardPress = (item) => {
    if (item.requiresAdmin) {
      const isAdmin =
        authUser?.uid === 2 ||
        authUser?.is_admin === true ||
        authUser?.is_superuser === true;
      if (!isAdmin) {
        showToastMessage('Only administrators can access this feature');
        return;
      }
    }
    navigation.navigate(item.screen, item.params || {});
  };

  const companyName =
    authUser?.company_name ||
    (Array.isArray(authUser?.company_id) ? authUser.company_id[1] : authUser?.company_id) ||
    authUser?.company?.name ||
    null;

  const renderCard = (item) => {
    if (item.empty) {
      return <View key={item.id} style={[styles.card, styles.cardInvisible]} />;
    }
    // `icon` may be a MaterialIcons name (string) or a require()'d image asset.
    const isImageAsset = typeof item.icon !== 'string';
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => handleCardPress(item)}
      >
        <View style={[styles.iconWrapper, { backgroundColor: item.bg }]}>
          {isImageAsset
            ? <Image source={item.icon} style={styles.cardIcon} resizeMode="contain" />
            : <MaterialIcons name={item.icon} size={32} color={item.accent} />}
        </View>
        <View style={styles.cardTextContainer}>
          <Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = (section) => (
    <View key={section.title} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: section.accent + '20' }]}>
          <MaterialIcons name={section.icon} size={18} color={section.accent} />
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.sectionLine} />
        <Text style={styles.sectionCount}>{section.items.length}</Text>
      </View>
      <View style={styles.sectionGrid}>
        {padItems(section.items).map(renderCard)}
      </View>
    </View>
  );

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <RoundedContainer>
        {/* Company logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('@assets/images/header/logo_header.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Carousel banner */}
        <CarouselPagination />

        {/* Date & Time pill */}
        <View style={styles.greetingContainer}>
          <MaterialIcons name="calendar-today" size={18} color={COLORS.primaryThemeColor} />
          <Text style={styles.dateText}>
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
          <View style={styles.timeBadge}>
            <MaterialIcons name="access-time" size={14} color="#fff" />
            <Text style={styles.timeText}>
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>

        {/* Quick Access header chip */}
        <View style={styles.quickAccessHeader}>
          <View>
            <Text style={styles.quickAccessTitle}>Quick Access</Text>
            <Text style={styles.quickAccessSubtitle}>Manage your store</Text>
          </View>
          {companyName ? (
            <View style={styles.companyBadge}>
              <MaterialIcons name="business" size={14} color="#fff" />
              <Text style={styles.companyBadgeText} numberOfLines={1}>{companyName}</Text>
            </View>
          ) : null}
        </View>

        {/* Grouped sections */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {SECTIONS.map(renderSection)}
          <Text style={styles.footer}>
            Powered by 369ai  |  v{appVersion}
          </Text>
        </ScrollView>
        <OverlayLoader visible={detailLoading} />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 10,
    marginTop: 4,
  },
  logoImage: {
    width: 260,
    height: 96,
  },

  greetingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8ECF0',
    gap: 8,
  },
  dateText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
  },

  quickAccessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 10,
    marginHorizontal: 8,
    marginTop: 4,
  },
  quickAccessTitle: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
  },
  quickAccessSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: 160,
  },
  companyBadgeText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#fff',
    marginLeft: 4,
  },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 10, paddingBottom: 100, paddingTop: 6 },

  section: { marginTop: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 8,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#E8ECF0', marginHorizontal: 6 },
  sectionCount: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#888',
    backgroundColor: '#F5F7FA',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 0 },
  card: {
    width: '47%',
    alignItems: 'center',
    margin: '1.5%',
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 6,
    minHeight: 130,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
    }),
  },
  cardInvisible: { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0, borderWidth: 0 },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  cardIcon: {
    width: 40,
    height: 40,
  },
  cardTextContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontSize: 11.5,
    textAlign: 'center',
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
    lineHeight: 15,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#B0B0B0',
    marginTop: 16,
    marginBottom: 10,
  },
});

export default HomeScreen;
