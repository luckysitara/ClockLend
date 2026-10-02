// Metro configuration.
//
// The only thing this changes is what ends up inside the shipped JS bundle.
// Metro's defaults are fine for development; these matter for the APK.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Strip console.* from the production bundle.
//
// Two reasons, in order of importance:
//
//  1. It is a leak vector. `console.log` calls in this codebase print RPC
//     URLs, transaction signatures and account addresses. Anything logged is a
//     string constant in the bundle, and the bundle ships inside the APK.
//  2. Logcat is world-readable to anything with adb access or a debug build of
//     a companion app, and a chatty release build tells an observer exactly
//     which code paths are executing.
//
// Warnings and errors are dropped too. If you need something to survive into a
// release build, do not use console — surface it in the UI.
config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig || {}),
  compress: {
    ...((config.transformer.minifierConfig || {}).compress || {}),
    drop_console: true,
  },
};

module.exports = config;
