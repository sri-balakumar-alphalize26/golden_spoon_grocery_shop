import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView } from '@components/containers';
import { FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LogoutModal } from '@components/Modal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import { version as appVersion } from '../../../package.json';

const NAVY = '#2E294E';
const NAVY_LIGHT = '#3d3768';
const ORANGE = '#F47B20';

const ProfileScreen = ({ navigation }) => {
  const userDetails = useAuthStore((state) => state.user);
  const [isVisible, setIsVisible] = useState(false);
  const hideLogoutAlert = () => setIsVisible(false);

  const name =
    userDetails?.related_profile?.name ||
    userDetails?.name ||
    userDetails?.user_name ||
    userDetails?.username ||
    'User';

  const company = userDetails?.company_id
    ? Array.isArray(userDetails.company_id)
      ? userDetails.company_id[1]
      : userDetails.company_id
    : userDetails?.company?.name || '';

  const login = userDetails?.login || userDetails?.user_email || '';

  const initials = name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const detailRows = [
    { key: 'uid', label: 'User ID', icon: 'badge', value: userDetails?.uid ?? '' },
    { key: 'login', label: 'Login', icon: 'alternate-email', value: userDetails?.login || '' },
    {
      key: 'db',
      label: 'Database',
      icon: 'storage',
      value: userDetails?.odoo_db || userDetails?.db || '',
    },
    {
      key: 'partner',
      label: 'Partner',
      icon: 'person-outline',
      value: Array.isArray(userDetails?.partner_id)
        ? userDetails.partner_id[1]
        : userDetails?.partner_id || '',
    },
    {
      key: 'role',
      label: 'Role',
      icon: 'admin-panel-settings',
      value: userDetails?.is_admin ? 'Administrator' : 'User',
    },
  ].filter((r) => r.value !== '' && r.value !== null && r.value !== undefined);

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('userData');
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const cartKeys = allKeys.filter((k) => k.startsWith('cart_'));
        if (cartKeys.length > 0) await AsyncStorage.multiRemove(cartKeys);
      } catch (_) {}
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'Splash' }] })
      );
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      hideLogoutAlert();
    }
  };

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Navy hero with faux gradient ── */}
        <View style={styles.hero}>
          <View style={styles.heroGloss} />

          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials || 'U'}</Text>
              </View>
            </View>
            <View style={styles.avatarBadge}>
              <MaterialIcons name="verified" size={14} color="#fff" />
            </View>
          </View>

          <Text style={styles.name}>{name}</Text>
          {company ? <Text style={styles.company}>{company}</Text> : null}
          {login ? <Text style={styles.loginText}>{login}</Text> : null}

          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Connected</Text>
          </View>
        </View>

        {/* ── Account Details tabular card ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardDot} />
            <Text style={styles.cardTitle}>Account Details</Text>
            <View style={{ flex: 1 }} />
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>{detailRows.length}</Text>
            </View>
          </View>

          {detailRows.map(({ key, label, icon, value }, idx) => {
            let display = value;
            if (Array.isArray(display)) display = display[1] || String(display[0] || '');
            else if (typeof display === 'object') display = display?.name || JSON.stringify(display);
            else display = String(display);

            const isLast = idx === detailRows.length - 1;
            return (
              <View key={key} style={[styles.row, isLast && { borderBottomWidth: 0 }]}>
                <View style={styles.rowLeft}>
                  <View style={styles.iconBox}>
                    <MaterialIcons name={icon} size={16} color={ORANGE} />
                  </View>
                  <Text style={styles.rowLabel}>{label}</Text>
                </View>
                <Text style={styles.rowValue} numberOfLines={1}>{display}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Quick action: about / version ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardDot} />
            <Text style={styles.cardTitle}>About</Text>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLeft}>
              <View style={styles.iconBox}>
                <MaterialCommunityIcons name="cellphone-information" size={16} color={ORANGE} />
              </View>
              <Text style={styles.rowLabel}>App Version</Text>
            </View>
            <Text style={styles.rowValue}>v{appVersion}</Text>
          </View>
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.85}
          onPress={() => setIsVisible(true)}
        >
          <MaterialIcons name="logout" size={20} color="#fff" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Powered by 369ai  |  v{appVersion}</Text>
      </ScrollView>

      <LogoutModal
        isVisible={isVisible}
        hideLogoutAlert={hideLogoutAlert}
        handleLogout={handleLogout}
      />
    </SafeAreaView>
  );
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: 100,
    backgroundColor: '#f6f7fb',
  },
  // ── Hero ──
  hero: {
    backgroundColor: NAVY,
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 56,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: NAVY_LIGHT,
    opacity: 0.5,
  },
  avatarWrap: {
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: ORANGE,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarText: {
    color: '#fff',
    fontSize: 34,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 22,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  company: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    marginBottom: 2,
    textAlign: 'center',
  },
  loginText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: FONT_FAMILY.urbanistRegular,
    textAlign: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(187,247,208,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  statusText: {
    color: '#dcfce7',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.5,
  },

  // ── Card ──
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 16,
    ...cardShadow,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardDot: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: ORANGE,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: NAVY,
    letterSpacing: 0.3,
  },
  countChip: {
    backgroundColor: '#fff1e6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countChipText: {
    color: ORANGE,
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
  },

  // ── Tabular row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f8',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#fff8f3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#666',
  },
  rowValue: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: NAVY,
    maxWidth: '50%',
    textAlign: 'right',
  },

  // ── Logout ──
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 18,
    paddingVertical: 14,
    backgroundColor: '#e74c3c',
    borderRadius: 14,
    shadowColor: '#e74c3c',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  logoutText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  version: {
    textAlign: 'center',
    marginTop: 22,
    color: '#a0a4b3',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistRegular,
  },
});

export default ProfileScreen;
