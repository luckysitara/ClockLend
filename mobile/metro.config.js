// Metro configuration.
//
// Two things happen here, both about what ends up inside the shipped JS bundle.
// Metro's defaults are fine for development; these matter for the APK.
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ---------------------------------------------------------------------------
// 1. Fail the BUILD if an EXPO_PUBLIC_* variable looks like it carries a key.
//
// This has to happen here rather than in app code. Metro's serialization step
// replaces `process.env.EXPO_PUBLIC_X` with a STRING LITERAL in the bundle, so a
// runtime `if (...) throw` in app code is not a gate at all: by the time it
// runs, the literal — key and all — is already inside the published APK. The
// app then crashes on launch, after the leak has shipped.
//
// This module is the only hook that covers every bundling path. The APK is
// assembled by Gradle (`assembleRelease` -> Expo CLI `export:embed`), not by an
// npm script, so a "prebuild" npm step would simply be bypassed. Metro loads
// this file on all of them.
//
// Expo's own docs confirm there is no built-in check for this ("Do not store
// sensitive info ... in EXPO_PUBLIC_ variables") and that any such guard has to
// come from your own tooling. This is that tooling.
// ---------------------------------------------------------------------------

// Each pattern describes credential material that must never be inlined.
const KEY_PATTERNS = [
  /api-?key=/i, // ?api-key=  /  ?apikey=
  /[?&]key=/i, // ?key=  (bare; the param-name regexes in the Worker missed this)
  /[?&]token=/i,
  /[?&]secret=/i,
  /x-api-key/i, // header material pasted into a URL or a constant
  /\/v2\/[A-Za-z0-9_-]{20,}/, // Alchemy-style path-embedded key
  /\/\/[^/@\s]+:[^/@\s]+@/, // userinfo: https://user:pass@host
];

// Read both the live environment AND the on-disk .env files. The gate must not
// depend on whether Expo's dotenv loading ran before this module was required.
function collectPublicEnvValues(dir) {
  const found = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('EXPO_PUBLIC_') && value) found.push([name, value, 'process.env']);
  }
  const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
  for (const file of envFiles) {
    try {
      const body = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const line of body.split('\n')) {
        const m = line.match(/^\s*(EXPO_PUBLIC_[A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && m[2]) {
          found.push([m[1], m[2].trim().replace(/^['"]|['"]$/g, ''), file]);
        }
      }
    } catch {
      // File is optional.
    }
  }
  return found;
}

const offenders = [];
for (const [name, value, source] of collectPublicEnvValues(__dirname)) {
  if (KEY_PATTERNS.some((re) => re.test(value))) offenders.push(`${name}  (from ${source})`);
}

if (offenders.length > 0) {
  throw new Error(
    '\n[ClockLend] Refusing to bundle — these EXPO_PUBLIC_ variables look like they ' +
      'carry a credential:\n' +
      offenders.map((o) => `  - ${o}`).join('\n') +
      '\n\nEXPO_PUBLIC_* values are inlined into the shipped JS bundle as string ' +
      'literals, so a key here is published to every app user and committed to git ' +
      '(the embedded bundle is tracked). The APK is public; `strings` recovers it.\n' +
      'Point these at a keyless proxy instead (see serverless /rpc) and keep the key ' +
      'in the Worker’s secret store.\n' +
      'If a keyed value has ALREADY been bundled, rotate it with the provider — ' +
      'removing it from the tree does not revoke it.\n'
  );
}

// ---------------------------------------------------------------------------
// 2. Strip console.* from the production bundle.
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
// ---------------------------------------------------------------------------
config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig || {}),
  compress: {
    ...((config.transformer.minifierConfig || {}).compress || {}),
    drop_console: true,
  },
};

module.exports = config;
