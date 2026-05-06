import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, StatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { LogoutModal } from '@components/Modal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import { version as appVersion } from '../../../package.json';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const ProfileScreen = ({ navigation }) => {
  const userDetails = useAuthStore((state) => state.user);
  const [isVisible, setIsVisible] = useState(false);
  const hideLogoutAlert = () => setIsVisible(false);

  const username =
    userDetails?.related_profile?.name ||
    userDetails?.username ||
    userDetails?.user_name ||
    userDetails?.name ||
    'User';

  const initial = (username || 'U').charAt(0).toUpperCase();

  const details = [
    { icon: 'fingerprint', label: 'User ID', value: userDetails?.uid ?? '-', color: '#2196F3' },
    {
      icon: 'storage',
      label: 'Database',
      value: userDetails?.odoo_db || userDetails?.db || userDetails?.database || '-',
      color: '#FF9800',
    },
    {
      icon: 'admin-panel-settings',
      label: 'Role',
      value: userDetails?.is_admin ? 'Admin' : 'User',
      color: '#9C27B0',
    },
    {
      icon: 'alternate-email',
      label: 'Login',
      value: userDetails?.login || userDetails?.user_email || '-',
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
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      hideLogoutAlert();
    }
  };

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header banner with company logo */}
        <View style={styles.header}>
          <Image
            source={require('@assets/images/header/logo_header.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Profile card */}
        <View style={styles.card}>
          {/* Orange round avatar — preserved per request */}
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          </View>

          <Text style={styles.username}>{username}</Text>
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
  logo: {
    width: 320,
    height: 128,
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
  // Avatar — kept ORANGE per user request, not navy.
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
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontFamily: FONT_FAMILY.urbanistBold,
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
});

export default ProfileScreen;
