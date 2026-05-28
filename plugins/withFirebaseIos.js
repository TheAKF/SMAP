const { withXcodeProject, withAppDelegate, withInfoPlist, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── Helper: extract a single key from a GoogleService-Info.plist ─────────────
// Uses a simple regex instead of a full XML parser — avoids @expo/plist API
// differences across Expo SDK versions (parse vs default.parse etc.).
function getPlistKey(filePath, key) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    // Plist format: <key>SOME_KEY</key>\n<string>SOME_VALUE</string>
    const re = new RegExp(
      '<key>' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</key>\\s*<string>([^<]+)</string>'
    );
    const m = text.match(re);
    return m ? m[1].trim() : null;
  } catch (e) {
    console.warn(`withFirebaseIos: failed to read plist at ${filePath}: ${e.message}`);
    return null;
  }
}

// ── Step 1: copy GoogleService-Info.plist into the Xcode project ─────────────
function withFirebasePlist(config) {
  return withXcodeProject(config, (config) => {
    const googleServicesFilePath = config.ios?.googleServicesFile;
    if (!googleServicesFilePath) {
      console.warn('withFirebaseIos: ios.googleServicesFile not set — skipping plist setup');
      return config;
    }

    const projectRoot = config.modRequest.projectRoot;
    const plistSrc = path.resolve(projectRoot, googleServicesFilePath);

    if (!fs.existsSync(plistSrc)) {
      console.warn(`withFirebaseIos: ${plistSrc} not found — skipping plist copy`);
      return config;
    }

    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
    const plistDest = path.join(sourceRoot, 'GoogleService-Info.plist');

    fs.copyFileSync(plistSrc, plistDest);
    console.log(`withFirebaseIos: copied plist → ${plistDest}`);

    const plistFilePath = `${projectName}/GoogleService-Info.plist`;
    if (!config.modResults.hasFile(plistFilePath)) {
      config.modResults = IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: plistFilePath,
        groupName: projectName,
        project: config.modResults,
        isBuildFile: true,
      });
    }

    return config;
  });
}

// ── Step 2: register REVERSED_CLIENT_ID as a URL scheme in Info.plist ────────
// Firebase phone auth falls back to a reCAPTCHA WKWebView when APNs is not
// available (e.g. a sideloaded app). After reCAPTCHA the web view redirects
// back to the app using the REVERSED_CLIENT_ID scheme. Without this scheme
// registered the callback silently fails / crashes the app.
function withFirebaseUrlScheme(config) {
  return withInfoPlist(config, (config) => {
    const googleServicesFilePath = config.ios?.googleServicesFile;
    if (!googleServicesFilePath) return config;

    const projectRoot = config.modRequest.projectRoot;
    const plistSrc = path.resolve(projectRoot, googleServicesFilePath);
    if (!fs.existsSync(plistSrc)) return config;

    const reversedClientId = getPlistKey(plistSrc, 'REVERSED_CLIENT_ID');
    if (!reversedClientId) {
      console.warn('withFirebaseIos: REVERSED_CLIENT_ID not found in plist — reCAPTCHA fallback may fail');
      console.warn('withFirebaseIos: To fix, enable Google Sign-In in Firebase console for this iOS app');
      return config;
    }
    console.log(`withFirebaseIos: REVERSED_CLIENT_ID = ${reversedClientId}`);

    const urlTypes = config.modResults.CFBundleURLTypes ?? [];

    const alreadyAdded = urlTypes.some((entry) =>
      Array.isArray(entry.CFBundleURLSchemes) &&
      entry.CFBundleURLSchemes.includes(reversedClientId)
    );

    if (!alreadyAdded) {
      urlTypes.push({
        CFBundleURLName: 'google',
        CFBundleURLSchemes: [reversedClientId],
      });
      console.log(`withFirebaseIos: registered URL scheme ${reversedClientId}`);
    } else {
      console.log(`withFirebaseIos: URL scheme ${reversedClientId} already registered`);
    }

    config.modResults.CFBundleURLTypes = urlTypes;
    return config;
  });
}

// ── Step 3: add `import Firebase` + `FirebaseApp.configure()` to AppDelegate ─
function withFirebaseAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('import Firebase')) return config;

    const lines = contents.split('\n');

    // Add `import Firebase` after the last `import …` line
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import /.test(lines[i])) lastImport = i;
    }
    if (lastImport >= 0) {
      lines.splice(lastImport + 1, 0, 'import Firebase');
    }

    // Add `FirebaseApp.configure()` before the first `return` inside didFinishLaunching
    let inDidFinish = false;
    let added = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('didFinishLaunchingWithOptions')) inDidFinish = true;
      if (inDidFinish && !added && /^\s+return /.test(lines[i])) {
        const indent = lines[i].match(/^(\s+)/)?.[1] ?? '    ';
        lines.splice(i, 0, `${indent}FirebaseApp.configure()`);
        added = true;
        break;
      }
    }

    if (!added) {
      console.warn('withFirebaseIos: could not find insertion point for FirebaseApp.configure() — add it manually');
    }

    config.modResults.contents = lines.join('\n');
    return config;
  });
}

module.exports = function withFirebaseIos(config) {
  config = withFirebasePlist(config);
  config = withFirebaseUrlScheme(config);   // ← NEW: registers REVERSED_CLIENT_ID URL scheme
  config = withFirebaseAppDelegate(config);
  return config;
};
