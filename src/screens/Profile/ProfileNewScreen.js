import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { SafeAreaView, ButtonContainer } from '@components/containers';
import Text from '@components/Text';
import { Button } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogoutModal } from '@components/Modal';

const ProfileNewScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [isVisible, setIsVisible] = useState(false);

  const displayName = (
    user?.related_profile?.name ||
    user?.user_name ||
    user?.name ||
    user?.username ||
    'User'
  );

  const companyName = (
    user?.company?.name?.toUpperCase?.() ||
    (Array.isArray(user?.company_id) && user?.company_id?.[1]?.toUpperCase?.()) ||
    (typeof user?.company_id === 'string' ? user?.company_id?.toUpperCase?.() : undefined) ||
    user?.user_companies?.current_company?.name?.toUpperCase?.() ||
    null
  );

  const subtitle = user?.user_name || user?.username || user?.login || null;

  const onLogout = async () => {
    try {
      await AsyncStorage.removeItem('userData');
    } catch {}
    navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
  };

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <Image
              source={require('@assets/images/Profile/user.png')}
              style={styles.avatar}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.name}>{displayName}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {companyName ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{companyName}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Account</Text>
            <Text style={styles.value}>Signed in</Text>
          </View>
          {subtitle ? (
            <View style={styles.rowDivider} />
          ) : null}
          {subtitle ? (
            <View style={styles.row}>
              <Text style={styles.label}>Username</Text>
              <Text style={styles.value}>{subtitle}</Text>
            </View>
          ) : null}
        </View>

        <ButtonContainer>
          <Button title="LOGOUT" paddingHorizontal={50} onPress={() => setIsVisible(true)} />
        </ButtonContainer>
      </View>

      <LogoutModal
        isVisible={isVisible}
        hideLogoutAlert={() => setIsVisible(false)}
        handleLogout={onLogout}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  avatarWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#f5f6fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 90,
    height: 90,
  },
  name: {
    fontSize: 22,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#242760',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#60636c',
    fontFamily: FONT_FAMILY.urbanistRegular,
  },
  badge: {
    marginTop: 10,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#111827',
  },
  section: {
    marginTop: 20,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#f1f2f6',
    marginHorizontal: 16,
  },
  label: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#4b5563',
  },
  value: {
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#111827',
  },
});

export default ProfileNewScreen;
