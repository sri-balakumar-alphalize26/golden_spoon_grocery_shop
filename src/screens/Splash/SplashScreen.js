import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import Constants from 'expo-constants';
import { getConfig } from '@utils/config';
import { useCurrencyStore } from '@stores/currency';
import * as deviceApi from '@api/services/deviceApi';

const SplashScreen = () => {
    const navigation = useNavigation();
    const setLoggedInUser = useAuthStore(state => state.login);
    const setCurrency = useCurrencyStore((state) => state.setCurrency);

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            // Currency init is best-effort; never block the navigation on it.
            try {
                const appName = Constants?.expoConfig?.name || '';
                const config = getConfig(appName);
                setCurrency(config.packageName);
            } catch (e) {
                console.warn('[SPLASH] currency init failed:', e);
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
