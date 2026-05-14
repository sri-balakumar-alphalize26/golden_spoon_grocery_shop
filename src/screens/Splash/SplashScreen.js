import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { useCurrencyStore } from '@stores/currency';
import * as deviceApi from '@api/services/deviceApi';
import { refreshCurrencyFromStorage } from '@api/services/currencyApi';

const SplashScreen = () => {
    const navigation = useNavigation();
    const setLoggedInUser = useAuthStore(state => state.login);
    const setCurrencyConfig = useCurrencyStore((state) => state.setCurrencyConfig);

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            // Hydrate currency from AsyncStorage (saved after the last successful
            // login). Never blocks navigation. If absent, UI renders without a
            // symbol until the user logs in and the post-login fetch populates it.
            try {
                const raw = await AsyncStorage.getItem('currencyConfig');
                console.log('[CURRENCY:SPLASH] AsyncStorage currencyConfig raw=', raw);
                if (raw) {
                    const cfg = JSON.parse(raw);
                    console.log('[CURRENCY:SPLASH] parsed cfg=', cfg);
                    if (cfg && typeof cfg === 'object') {
                        setCurrencyConfig(cfg);
                        console.log('[CURRENCY:SPLASH] pushed to useCurrencyStore');
                    } else {
                        console.warn('[CURRENCY:SPLASH] parsed cfg is not an object — ignored');
                    }
                } else {
                    console.log('[CURRENCY:SPLASH] no AsyncStorage entry — currency stays empty until login');
                }
            } catch (e) {
                console.warn('[CURRENCY:SPLASH] hydrate failed:', e?.message || e);
            }

            // Step 1: check device config in AsyncStorage
            let deviceUuid = null;
            let deviceServerUrl = null;
            let deviceDbName = null;
            let deviceRegistered = null;
            try {
                const pairs = await AsyncStorage.multiGet([
                    'device_uuid',
                    'device_server_url',
                    'device_db_name',
                    'device_registered',
                ]);
                deviceUuid = pairs[0][1];
                deviceServerUrl = pairs[1][1];
                deviceDbName = pairs[2][1];
                deviceRegistered = pairs[3][1];
            } catch (e) {
                console.warn('[SPLASH] AsyncStorage device read failed:', e);
            }

            if (cancelled) return;

            // First launch or device not configured → DeviceSetup
            if (!deviceServerUrl || !deviceDbName || deviceRegistered !== 'true') {
                try {
                    navigation.reset({ index: 0, routes: [{ name: 'DeviceSetup' }] });
                } catch (_) {}
                return;
            }

            // Fire-and-forget last_login refresh — never block boot on it.
            if (deviceUuid) {
                deviceApi.initDevice({
                    baseUrl: deviceServerUrl,
                    databaseName: deviceDbName,
                    deviceId: deviceUuid,
                    deviceName: 'Golden Spoon Vegetables',
                }).catch(() => {});
            }

            // Step 2: device approved — restore user session if any, else go to Login
            let userData = null;
            try {
                const storedUserData = await AsyncStorage.getItem('userData');
                if (cancelled) return;
                if (storedUserData) {
                    try { userData = JSON.parse(storedUserData); } catch (_) { userData = null; }
                }
            } catch (e) {
                console.warn('[SPLASH] AsyncStorage userData read failed:', e);
            }

            if (cancelled) return;

            // FORCE a fresh currency fetch from Odoo BEFORE leaving Splash
            // so the very first paint of AppNavigator (or Login) already
            // uses the right symbol. Bounded by a 6s timeout so a slow/dead
            // server can't strand the user on the splash screen.
            if (userData) {
                try {
                    const fresh = await Promise.race([
                        refreshCurrencyFromStorage(),
                        new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
                    ]);
                    if (fresh && !cancelled) {
                        console.log('[CURRENCY:SPLASH] forced refresh applied:', fresh);
                        if (fresh.symbol || fresh.name) {
                            setCurrencyConfig(fresh);
                            useAuthStore.getState().setCurrency(fresh);
                        }
                        if (fresh._digitsMap) {
                            useAuthStore.getState().setDecimalAccuracy(fresh._digitsMap);
                            console.log('[CURRENCY:SPLASH] forced refresh digits applied:', fresh._digitsMap);
                        }
                    } else if (!fresh) {
                        console.log('[CURRENCY:SPLASH] forced refresh returned null or timed out');
                    }
                } catch (e) {
                    console.warn('[CURRENCY:SPLASH] forced refresh threw:', e?.message || e);
                }
            }

            if (cancelled) return;

            try {
                if (userData) {
                    try { setLoggedInUser(userData); } catch (_) {}
                    navigation.reset({ index: 0, routes: [{ name: 'AppNavigator' }] });
                } else {
                    navigation.reset({ index: 0, routes: [{ name: 'LoginScreenOdoo' }] });
                }
            } catch (err) {
                console.error('[SPLASH] navigation reset failed, retrying to login:', err);
                try {
                    navigation.reset({ index: 0, routes: [{ name: 'LoginScreenOdoo' }] });
                } catch (_) {}
            }
        };

        boot();
        return () => { cancelled = true; };
    }, []);

    return (
        <View style={styles.container}>
            <Image
                source={require('@assets/images/Splash/splash.png')}
                style={styles.image}
                resizeMode="contain"
            />
            <Text style={styles.poweredText}>Powered by 369ai</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    poweredText: {
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
        fontSize: 12,
        color: '#94a3b8',
        fontFamily: FONT_FAMILY.urbanistMedium,
        letterSpacing: 0.4,
    },
});

export default SplashScreen;
