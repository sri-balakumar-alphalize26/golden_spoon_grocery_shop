import React, { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import { AppState, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import CustomToast from '@components/Toast/CustomToast';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Import GestureHandlerRootView
import StackNavigator from '@navigation/StackNavigator';
import { Provider } from 'react-native-paper';
import { useAuthStore } from '@stores/auth';
import installNetworkInterceptor from './src/api/utils/networkInterceptor';
import installAuthInterceptor from './src/api/utils/authInterceptor';
import NetworkErrorModal from './src/components/NetworkError/NetworkErrorModal';
import { lockPortrait } from './src/utils/orientation';

installNetworkInterceptor();
installAuthInterceptor();

export default function App() {

  const [fontsLoaded, setFontsLoaded] = useState(false);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    LogBox.ignoreLogs(["new NativeEventEmitter"]);
    LogBox.ignoreAllLogs();
    LogBox.ignoreLogs(["Non-serializable values were found in the navigation state"]);

    // app.json orientation is "default" (both allowed natively) so the layout
    // editor can go landscape; keep the rest of the app portrait by default.
    lockPortrait();

    async function loadFonts() {
      try {
        await Font.loadAsync({
          'Urbanist-Black': require('@assets/fonts/Urbanist/Urbanist-Black.ttf'),
          'Urbanist-Bold': require('@assets/fonts/Urbanist/Urbanist-Bold.ttf'),
          'Urbanist-ExtraBold': require('@assets/fonts/Urbanist/Urbanist-ExtraBold.ttf'),
          'Urbanist-ExtraLight': require('@assets/fonts/Urbanist/Urbanist-ExtraLight.ttf'),
          'Urbanist-Light': require('@assets/fonts/Urbanist/Urbanist-Light.ttf'),
          'Urbanist-Medium': require('@assets/fonts/Urbanist/Urbanist-Medium.ttf'),
          'Urbanist-Regular': require('@assets/fonts/Urbanist/Urbanist-Regular.ttf'),
          'Urbanist-SemiBold': require('@assets/fonts/Urbanist/Urbanist-SemiBold.ttf'),
          'Urbanist-Thin': require('@assets/fonts/Urbanist/Urbanist-Thin.ttf'),
        });
      } catch (e) {
        console.warn('Font load failed in App.js', e);
      } finally {
        setFontsLoaded(true);
      }
    }
    loadFonts();

    // Initialize auth state from AsyncStorage
    initializeAuth();

    // Refresh the cached Odoo company letterhead whenever the app returns to
    // the foreground, so an admin edit (company name / address / phone /
    // email) reflects without a logout. Fire-and-forget.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        try { useAuthStore.getState().refreshCompanyProfile?.(); } catch (_) {}
        try { useAuthStore.getState().refreshUserProfile?.(); } catch (_) {}
      }
    });
    return () => {
      try { appStateSub.remove(); } catch (_) {}
    };
  }, []);

  // Render the tree on the very first frame so the navigator can mount its
  // initial route (SplashScreen) immediately. Fonts finish loading right
  // after; until then RN falls back to system fonts (invisible during the
  // ~300 ms splash window).

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider>
        <NavigationContainer>
          <SafeAreaProvider>
            <BottomSheetModalProvider>
              <StackNavigator />
            </BottomSheetModalProvider>
            <Toast config={CustomToast} />
          </SafeAreaProvider>
        </NavigationContainer>
        <NetworkErrorModal />
      </Provider>
    </GestureHandlerRootView>
  );
}
