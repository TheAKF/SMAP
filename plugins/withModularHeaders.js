const { withPodfile } = require('@expo/config-plugins');

/**
 * Adds `use_modular_headers!` to the Podfile so that GoogleUtilities
 * (required by FirebaseCoreInternal) generates a module map.
 * This fixes: "The Swift pod FirebaseCoreInternal depends upon GoogleUtilities,
 * which does not define modules."
 */
module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    if (podfile.includes('use_modular_headers!')) {
      // Already patched
      return config;
    }

    // Insert after the first `platform :ios` line
    config.modResults.contents = podfile.replace(
      /(platform :ios[^\n]*\n)/,
      '$1use_modular_headers!\n'
    );

    return config;
  });
};
