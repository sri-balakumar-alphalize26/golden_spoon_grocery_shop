import fs from 'fs';
import path from 'path';
import { getConfig } from './src/utils/config/getConfig.js';
import dotenv from 'dotenv';

dotenv.config();

const appName = process.env.EXPO_PUBLIC_APP_NAME;
const config = getConfig(appName);

if (!config) {
  console.error(`No configuration found for appName: ${appName}`);
  process.exit(1);
}

if (!config.appName) {
  console.error(`appName is undefined in the configuration for appName: ${appName}`);
  process.exit(1);
}

const appJson = {
  expo: {
    name: config.appName,
    slug: config.appName.toLowerCase(),
    version: '1.0.8',
    orientation: 'portrait',
    icon: './assets/android/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
    },
    android: {
      splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
      adaptiveIcon: {
        foregroundImage: './assets/android/icon_foreground.png',
        backgroundImage: './assets/android/icon_background.png',
        monochromeImage: './assets/android/icon_monochrome.png',
        backgroundColor: '#ffffff',
      },
      icon: './assets/android/icon.png',
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
      ],
      package: config.packageName,
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
          },
        },
      ],
      'expo-font',
      [
  // ...existing code...
        {
          photosPermission:
            'The app accesses your photos to let you share them with your friends.',
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Allow $(PRODUCT_NAME) to access your camera',
          microphonePermission: 'Allow $(PRODUCT_NAME) to access your microphone',
          recordAudioAndroid: true,
        },
      ],
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow $(PRODUCT_NAME) to use your location."
        }
      ]
    ],
    extra: {
      eas: {
        projectId: config.projectId,
      },
    },
  },
};

fs.writeFileSync(path.join(process.cwd(), 'app.json'), JSON.stringify(appJson, null, 2));
console.log('app.json has been generated successfully.');