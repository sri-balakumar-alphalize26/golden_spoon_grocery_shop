import { Platform, ToastAndroid } from 'react-native';
import Toast from 'react-native-toast-message';

export const showToastMessage = (message) => {
  if (Platform.OS === 'android') {
    // For Android
    ToastAndroid.showWithGravityAndOffset(
      message,
      ToastAndroid.LONG,
      ToastAndroid.BOTTOM,
      25,
      50
    );
  } else {
    // For iOS or other platforms
    Toast.show({
      type: 'info', // or 'success', 'error', 'warning'
      text1: message,
      position: 'bottom',
      visibilityTime: 3000, // 3 seconds
    });
  }
};
