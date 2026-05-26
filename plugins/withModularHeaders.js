const { withPodfile } = require('@expo/config-plugins');

/**
 * Fixes: "FirebaseCoreInternal depends upon GoogleUtilities, which does not define modules"
 * Inserts pod 'GoogleUtilities', :modular_headers => true inside the main target block.
 */
module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    let podfile = config.modResults.contents;

    // Already patched
    if (podfile.includes("pod 'GoogleUtilities', :modular_headers => true")) {
      return config;
    }

    // Strategy 1: insert inside target block (most targeted fix)
    if (podfile.includes("target 'SchoolMap' do")) {
      podfile = podfile.replace(
        "target 'SchoolMap' do\n",
        "target 'SchoolMap' do\n  pod 'GoogleUtilities', :modular_headers => true\n"
      );
    } else {
      // Strategy 2: fallback — add use_modular_headers! globally
      podfile = podfile.replace(
        /(platform :ios[^\n]*\n)/,
        '$1use_modular_headers!\n'
      );
    }

    config.modResults.contents = podfile;
    return config;
  });
};
