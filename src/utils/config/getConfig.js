
export const getConfig = (appName) => {
  const configs = {
    [process.env.EXPO_PUBLIC_APP_NAME_UAE]: {
      appName: process.env.EXPO_PUBLIC_APP_NAME_UAE,
      packageName: process.env.EXPO_PUBLIC_PACKAGE_NAME_UAE,
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID_UAE,
    },
    [process.env.EXPO_PUBLIC_APP_NAME_OMAN]: {
      appName: process.env.EXPO_PUBLIC_APP_NAME_OMAN,
      packageName: process.env.EXPO_PUBLIC_PACKAGE_NAME_OMAN,
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID_OMAN,
    },
    // newly added
    [process.env.EXPO_PUBLIC_APP_NAME_UAE_TEST]: {
      appName: process.env.EXPO_PUBLIC_APP_NAME_UAE_TEST,
      packageName: process.env.EXPO_PUBLIC_PACKAGE_NAME_UAE_TEST,
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID_UAE_TEST,
    },
    [process.env.EXPO_PUBLIC_APP_NAME_ALPHA]: {
      appName: process.env.EXPO_PUBLIC_APP_NAME_ALPHA,
      packageName: process.env.EXPO_PUBLIC_PACKAGE_NAME_ALPHA,
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID_ALPHA,
    },
  };

  return configs[appName] || {};
};
