// navigation/AppNavigator.js
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TabBarIcon } from '@components/TabBar';
import { LogoutModal } from '@components/Modal';
import { HomeScreen, ProfileScreen } from '@screens';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const Tab = createBottomTabNavigator();

// Empty placeholder — never actually rendered because the Logout tab
// intercepts `tabPress` and shows the confirmation modal instead.
const LogoutPlaceholder = () => <View />;

const AppNavigator = () => {
  const [isLogoutVisible, setLogoutVisible] = useState(false);
  const [logoutNav, setLogoutNav] = useState(null);

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
