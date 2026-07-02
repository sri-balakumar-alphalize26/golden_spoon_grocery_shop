// navigation/AppNavigator.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { CommonActions, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TabBarIcon } from '@components/TabBar';
import { LogoutModal } from '@components/Modal';
import { HomeScreen, ProfileScreen } from '@screens';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import * as deviceApi from '@api/services/deviceApi';
import { getDeviceName } from '@utils/deviceInfo';
import { showToastMessage } from '@components/Toast';

const Tab = createBottomTabNavigator();

// Empty placeholder — never actually rendered because the Logout tab
// intercepts `tabPress` and shows the confirmation modal instead.
const LogoutPlaceholder = () => <View />;

const AppNavigator = () => {
  const navigation = useNavigation();
  const [isLogoutVisible, setLogoutVisible] = useState(false);
  const [logoutNav, setLogoutNav] = useState(null);

  // In-app block/deactivate watcher. Splash already gates on cold start; this
  // catches a device blocked/deactivated in Odoo *while the user is actively
  // using the app*. Polls every 5s + on app foreground. On block/deactivate it
  // clears the session and resets to Splash, whose boot gate lands on Device Setup.
  const checkDeviceStatus = useCallback(async () => {
    try {
      const [uuid, url, db, registered] = await Promise.all([
        AsyncStorage.getItem('device_uuid'),
        AsyncStorage.getItem('device_server_url'),
        AsyncStorage.getItem('device_db_name'),
        AsyncStorage.getItem('device_registered'),
      ]);
      if (!uuid || !url || !db || registered !== 'true') return;

      const res = await deviceApi.initDevice({
        baseUrl: url,
        databaseName: db,
        deviceId: uuid,
        deviceName: getDeviceName(),
      });
      const status = res?.status;
      console.log('[DEVICE] in-app block check — status =', status);
      if (status === 'blocked' || status === 'deactivated') {
        if (status === 'blocked') {
          console.log(
            `[DEVICE] in-app blocked — serial=${res?.serial_no || '—'} at=${res?.last_blocked || '—'}`
          );
        }
        console.log('[DEVICE] in-app bounce to DeviceSetup — status =', status);
        try { await AsyncStorage.removeItem('device_registered'); } catch (_) {}
        try { await AsyncStorage.removeItem('userData'); } catch (_) {}
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const cartKeys = allKeys.filter((k) => k.startsWith('cart_'));
          if (cartKeys.length > 0) await AsyncStorage.multiRemove(cartKeys);
        } catch (_) {}
        showToastMessage(
          status === 'blocked'
            ? `Device blocked (Serial ${res?.serial_no || '—'}). Contact your administrator.`
            : "This device's session ended. Please reconnect by scanning the QR."
        );
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: 'Splash' }] })
        );
      }
    } catch (e) {
      // Offline / unreachable — can't verify, so don't kick the user out.
      console.log('[DEVICE] in-app block check failed (offline tolerance) —', e?.message || e);
    }
  }, [navigation]);

  useEffect(() => {
    checkDeviceStatus(); // initial check on entering the app
    const interval = setInterval(checkDeviceStatus, 5000); // every 5s
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkDeviceStatus();
        // Re-detect the dynamic-invoice switch on foreground so flipping
        // "Use Dynamic Invoice on App" in Odoo reflects within ~1s without a
        // relaunch (mirrors the company-profile foreground refresh).
        try { require('@stores/auth').useAuthStore.getState().refreshDynamicInvoiceFlag?.(); } catch (_) {}
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [checkDeviceStatus]);

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('userData');
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const cartKeys = allKeys.filter((k) => k.startsWith('cart_'));
        if (cartKeys.length > 0) await AsyncStorage.multiRemove(cartKeys);
      } catch (_) {}
      if (logoutNav) {
        logoutNav.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: 'Splash' }] })
        );
      }
    } catch (e) {
      console.error('Error logging out:', e);
    } finally {
      setLogoutVisible(false);
    }
  };

  const tabBarOptions = {
    tabBarShowLabel: false,
    tabBarHideOnKeyboard: true,
    headerShown: false,
    tabBarStyle: {
      position: 'absolute',
      bottom: 5,
      right: 10,
      left: 10,
      borderTopRightRadius: 20,
      borderTopLeftRadius: 20,
      elevation: 0,
      height: 60,
      backgroundColor: '#2e294e',
    },
  };

  return (
    <>
      <Tab.Navigator screenOptions={tabBarOptions}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabBarIcon
                focused={focused}
                iconComponent={require('@assets/icons/bottom_tabs/home.png')}
                label="Home"
              />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabBarIcon
                focused={focused}
                iconComponent={require('@assets/icons/bottom_tabs/profile.png')}
                label="Profile"
              />
            ),
          }}
        />
        <Tab.Screen
          name="Logout"
          component={LogoutPlaceholder}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              setLogoutNav(navigation);
              setLogoutVisible(true);
            },
          })}
          options={{
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: 70 }}>
                <View
                  style={{
                    width: 40,
                    height: 30,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: focused ? COLORS.white : COLORS.primaryThemeColor,
                  }}
                >
                  <MaterialIcons name="logout" size={18} color={focused ? COLORS.lightBlack : COLORS.white} />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: COLORS.white,
                    fontSize: 11,
                    fontFamily: FONT_FAMILY.urbanistSemiBold,
                    marginTop: 2,
                  }}
                >
                  Logout
                </Text>
              </View>
            ),
          }}
        />
      </Tab.Navigator>
      <LogoutModal
        isVisible={isLogoutVisible}
        hideLogoutAlert={() => setLogoutVisible(false)}
        handleLogout={handleLogout}
      />
    </>
  );
};

export default AppNavigator;
