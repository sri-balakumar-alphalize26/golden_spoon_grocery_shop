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
        const appName = Constants.expoConfig.name;
        const config = getConfig(appName);
        setCurrency(config.packageName);

        const checkUserData = async () => {
            const storedUserData = await AsyncStorage.getItem('userData');
            if (storedUserData) {
                const userData = JSON.parse(storedUserData);
                setLoggedInUser(userData);
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'AppNavigator' }],
                });
            } else {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'LoginScreenOdoo' }],
                });
            }
        };

        const timeout = setTimeout(checkUserData, 300);
        return () => clearTimeout(timeout);
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
