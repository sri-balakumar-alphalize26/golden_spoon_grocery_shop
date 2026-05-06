import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import Constants from 'expo-constants';
import { getConfig } from '@utils/config';
import { useCurrencyStore } from '@stores/currency';

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

            let userData = null;
            try {
                const storedUserData = await AsyncStorage.getItem('userData');
                if (cancelled) return;
                if (storedUserData) {
                    try { userData = JSON.parse(storedUserData); } catch (_) { userData = null; }
                }
            } catch (e) {
                console.warn('[SPLASH] AsyncStorage read failed:', e);
            }

            if (cancelled) return;

            try {
                if (userData) {
                    // Fire-and-forget; do not await — login() runs a network call
                    // that must not block navigation.
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
            <Text style={styles.versionText}>Version 1.0.8</Text>
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
    versionText: {
        position: 'absolute',
        bottom: 30,
        fontSize: 16,
        marginTop: 20,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistBold,
    },
});

export default SplashScreen;
