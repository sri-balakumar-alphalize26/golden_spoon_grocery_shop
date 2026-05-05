const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;
    
    // Get application tag
    const application = androidManifest.application[0];
    
    // Add usesCleartextTraffic attribute
    application.$['android:usesCleartextTraffic'] = 'true';
    
    return config;
  });
};
