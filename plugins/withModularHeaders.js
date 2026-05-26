const { withPodfile } = require('@expo/config-plugins');

/**
 * Fixes: "FirebaseCoreInternal depends upon GoogleUtilities, which does not define modules"
 * Adds `use_modular_headers!` globally in the Podfile, right after the `platform :ios` line.
 * This is the recommended fix for Expo + Firebase on iOS.
 */
module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    let podfile = config.modResults.contents;

    // Already patched
    if (podfile.includes('use_modular_headers!')) {
      return config;
    }

    // Add use_modular_headers! right after `platform :ios ...` line
    const patched = podfile.replace(
      /(platform :ios[^\n]*\n)/,
      '$1use_modular_headers!\n'
    );

    if (patched === podfile) {
      // Fallback: prepend to file
      config.modResults.contents = 'use_modular_headers!\n' + podfile;
    } else {
      config.modResults.contents = patched;
    }

    return config;
  });
};
