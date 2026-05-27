const { withXcodeProject, withAppDelegate, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

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
  config = withFirebaseAppDelegate(config);
  return config;
};
