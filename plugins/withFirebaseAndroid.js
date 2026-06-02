const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Applies the Google Services Gradle plugin for Android Firebase.
 * This replaces the iOS-incompatible @react-native-firebase/app Expo plugin
 * which crashes on Swift AppDelegate projects.
 */
module.exports = function withFirebaseAndroid(config) {
  // 1. Add google-services classpath to root build.gradle
  config = withProjectBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes('com.google.gms:google-services')) return cfg;
    cfg.modResults.contents = contents.replace(
      /dependencies\s*\{/,
      'dependencies {\n        classpath("com.google.gms:google-services:4.4.2")'
    );
    return cfg;
  });

  // 2. Apply the plugin in app/build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes('com.google.gms.google-services')) return cfg;
    cfg.modResults.contents = contents + '\napply plugin: "com.google.gms.google-services"\n';
    return cfg;
  });

  return config;
};
