import React, { useState, useCallback } from 'react';
import { View, Image, ScrollView, StyleSheet, TouchableOpacity, StatusBar, Switch } from 'react-native';
import RNModal from 'react-native-modal';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { LogoutModal } from '@components/Modal';
import { SHOW_MANUAL_KEY } from '@utils/userManual';
import { version as appVersion } from '../../../package.json';

const NAVY = COLORS.primaryThemeColor;

const ProfileNewScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [isVisible, setIsVisible] = useState(false);
  const hideLogoutAlert = () => setIsVisible(false);

  // Admins can flip the manual on/off for this device; everyone on the
  // device then sees the option follow that flag.
  const isAdmin = !!(user?.is_admin || user?.uid === 2 || user?.is_superuser);

  // User-manual visibility (per-device, AsyncStorage). Default ON.
  const [showManual, setShowManual] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      AsyncStorage.getItem(SHOW_MANUAL_KEY)
        .then((v) => { if (alive && v !== null) setShowManual(v === 'true'); })
        .catch(() => {});
      return () => { alive = false; };
    }, [])
  );

  // Confirm before flipping. The Switch is controlled by `showManual`, so it
  // won't visually move until the user confirms. `pendingShow` holds the
  // value being confirmed.
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingShow, setPendingShow] = useState(false);

  const toggleShowManual = (next) => {
    setPendingShow(next);
    setConfirmVisible(true);
  };

  const confirmToggle = async () => {
    const next = pendingShow;
    setConfirmVisible(false);
    setShowManual(next);
    try { await AsyncStorage.setItem(SHOW_MANUAL_KEY, next ? 'true' : 'false'); } catch (_) {}
  };

  const displayName =
    user?.related_profile?.name ||
    user?.user_name ||
    user?.name ||
    user?.username ||
    'User';

  const subtitle = user?.user_name || user?.username || user?.login || null;

  const details = [
    { icon: 'fingerprint', label: 'User ID', value: user?.uid ?? '-', color: '#2196F3' },
    {
      icon: 'storage',
      label: 'Database',
      value: user?.odoo_db || user?.db || user?.database || '-',
      color: '#FF9800',
    },
    {
      icon: 'admin-panel-settings',
      label: 'Role',
      value: user?.is_admin ? 'Admin' : 'User',
      color: '#9C27B0',
    },
    {
      icon: 'alternate-email',
      label: 'Login',
      value: user?.login || user?.user_email || subtitle || '-',
      color: '#00897B',
    },
  ];

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
    } catch (e) {
      console.error('Error logging out:', e);
    } finally {
      hideLogoutAlert();
    }
  };

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Navy header banner with company logo on a white plate */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Image
              source={require('@assets/images/header/logo_header.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Profile card */}
        <View style={styles.card}>
          {/* Round avatar showing the user's first initial. */}
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarRing}>
              <Text style={styles.avatarInitial}>
                {(displayName || 'U').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.username}>{displayName}</Text>
          <View style={styles.connectedBadge}>
            <MaterialIcons name="verified" size={13} color="#4CAF50" />
            <Text style={styles.connectedText}>Connected</Text>
          </View>

          <View style={styles.dividerLine} />

          {/* Account Details rows */}
          {details.map((item, index) => (
            <View key={index} style={{ width: '100%' }}>
              <View style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: item.color + '18' }]}>
                  <MaterialIcons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.value} numberOfLines={1}>{String(item.value)}</Text>
                </View>
              </View>
              {index < details.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Help & settings card — groups the User Manual action and the
            admin-only visibility toggle. Admins ALWAYS see the manual;
            staff see it only while the toggle is on. */}
        {(isAdmin || showManual) ? (
          <View style={styles.manualCard}>
            <Text style={styles.manualCardHeader}>HELP</Text>

            {/* Manual action — admins always; staff only when enabled. */}
            {(isAdmin || showManual) ? (
              <TouchableOpacity
                style={styles.manualRow}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('UserManual')}
              >
                <View style={[styles.manualIcon, { backgroundColor: NAVY + '12' }]}>
                  <MaterialIcons name="menu-book" size={22} color={NAVY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>User Manual</Text>
                  <Text style={styles.actionSub}>View or download the guides</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color="#C4CAD4" />
              </TouchableOpacity>
            ) : null}

            {/* Admin-only visibility toggle. */}
            {isAdmin ? (
              <>
                <View style={styles.manualDivider} />
                <View style={styles.manualRow}>
                  <View style={[styles.manualIcon, { backgroundColor: '#2196F312' }]}>
                    <MaterialIcons name="groups" size={22} color="#2196F3" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>Show to users</Text>
                    <Text style={styles.actionSub}>
                      {showManual ? 'Users can see the manual' : 'Hidden for users (you always see it)'}
                    </Text>
                  </View>
                  <Switch
                    value={showManual}
                    onValueChange={toggleShowManual}
                    trackColor={{ true: NAVY, false: '#cfd3dc' }}
                    thumbColor="#fff"
                    ios_backgroundColor="#cfd3dc"
                  />
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Logout button */}
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

      {/* Toggle confirmation — same look as LogoutModal (white card, navy
          2px border, two navy buttons). */}
      <RNModal
        isVisible={confirmVisible}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.7}
        animationInTiming={400}
        animationOutTiming={300}
        onBackButtonPress={() => setConfirmVisible(false)}
        onBackdropPress={() => setConfirmVisible(false)}
      >
        <View style={styles.confirmContainer}>
          <Text style={styles.confirmText}>
            {pendingShow
              ? 'Show the User Manual to users on this device?'
              : 'Hide the User Manual from users on this device?'}
          </Text>
          <View style={styles.confirmRow}>
            <TouchableOpacity style={[styles.confirmButton, { flex: 1 }]} onPress={confirmToggle}>
              <Text style={styles.confirmButtonText}>YES</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmButton, { flex: 1 }]} onPress={() => setConfirmVisible(false)}>
              <Text style={styles.confirmButtonText}>NO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

      <LogoutModal
        isVisible={isVisible}
        hideLogoutAlert={hideLogoutAlert}
        handleLogout={handleLogout}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    backgroundColor: '#F2F4F8',
    paddingBottom: 100,
  },
  header: {
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 30,
    paddingBottom: 100,
  },
  // White plate behind the logo (logo PNG reads better on white than navy).
  logoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  logo: {
    width: 280,
    height: 96,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginHorizontal: 16,
    marginTop: -40,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    alignItems: 'center',
  },
  // Avatar — kept as the human round IMAGE (user.png) per user request.
  avatarWrapper: {
    position: 'absolute',
    top: -44,
    alignSelf: 'center',
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitial: {
    fontSize: 36,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#FFFFFF',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  username: {
    fontSize: 22,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: NAVY,
    marginBottom: 4,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 20,
  },
  connectedText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#4CAF50',
  },
  dividerLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#ECECEC',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    width: '100%',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    marginLeft: 14,
  },
  label: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray,
    marginBottom: 2,
  },
  value: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: NAVY,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  manualCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  manualCardHeader: {
    fontSize: 11,
    letterSpacing: 1,
    color: '#9AA3B2',
    fontFamily: FONT_FAMILY.urbanistBold,
    marginLeft: 6,
    marginBottom: 2,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  manualIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  manualDivider: {
    height: 1,
    backgroundColor: '#F0F2F5',
    marginLeft: 64,
  },
  actionTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: NAVY,
    marginBottom: 2,
  },
  actionSub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#8896ab',
  },
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
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 20,
  },
  // Toggle confirmation — mirrors LogoutModal.
  confirmContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderColor: NAVY,
    borderWidth: 2,
    paddingVertical: 22,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  confirmText: {
    marginVertical: 18,
    fontSize: 16,
    color: NAVY,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmButton: {
    backgroundColor: NAVY,
    borderRadius: 10,
    padding: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  confirmButtonText: {
    color: 'white',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});

export default ProfileNewScreen;
