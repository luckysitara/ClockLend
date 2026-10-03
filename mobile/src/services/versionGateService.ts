import * as Application from 'expo-application';
import { Linking, Platform } from 'react-native';

export interface VersionConfig {
  minimumVersion: string;
  minimumBuildNumber: number;
  latestVersion: string;
  forceUpdate: boolean;
  dappStoreUrl: string;
  marketUrl: string;
  webUrl: string;
  title?: string;
  message?: string;
}

export interface VersionGateResult {
  needsUpdate: boolean;
  isMandatory: boolean;
  installedVersion: string;
  installedBuild: number;
  minimumVersion: string;
  latestVersion: string;
  config: VersionConfig;
}

const DEFAULT_CONFIG: VersionConfig = {
  minimumVersion: '1.0.0',
  minimumBuildNumber: 1,
  latestVersion: '1.0.0',
  forceUpdate: true,
  dappStoreUrl: 'solanadappstore://details?id=com.clocklend.app',
  marketUrl: 'market://details?id=com.clocklend.app',
  webUrl: 'https://clocklend.kikhaus.com',
  title: 'Update Required',
  message:
    'A newer version of ClockLend is available on the Solana dApp Store. Please update your app to continue using the protocol.',
};

// Remote endpoints to check for version requirements (with automatic fallback)
const REMOTE_VERSION_URLS = [
  'https://seek.kikhaus.com/version.json',
  'https://clocklend.kikhaus.com/version.json',
  // Was .../Clock-It/... — the GitHub repo was renamed to ClockLend, so this
  // pointed at a name no longer under our control. Since this document can force
  // a lockout and supply a URL that gets opened, a stale namespace is a
  // supply-chain hole, not just a broken link: whoever claims the old name could
  // serve a malicious version.json.
  'https://raw.githubusercontent.com/luckysitara/ClockLend/master/site/version.json',
];

/**
 * Compare two Semantic Version strings (e.g. "1.0.0" vs "1.0.1")
 * Returns true if installed is strictly less than required.
 */
export function isVersionOutdated(installed: string, required: string): boolean {
  if (!required) return false;
  if (!installed) return true;

  const iParts = installed.replace(/^v/i, '').split('.').map((p) => parseInt(p, 10) || 0);
  const rParts = required.replace(/^v/i, '').split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(iParts.length, rParts.length);
  for (let i = 0; i < maxLen; i++) {
    const a = iParts[i] ?? 0;
    const b = rParts[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

/**
 * Fetch remote version policy and check against device's installed version.
 */
export async function checkAppVersion(): Promise<VersionGateResult> {
  const installedVersion = Application.nativeApplicationVersion || '2.0.0';
  const installedBuild = parseInt(Application.nativeBuildVersion || '2', 10);

  let remoteConfig: VersionConfig = { ...DEFAULT_CONFIG };

  // Attempt to fetch live config from primary or secondary URL
  for (const url of REMOTE_VERSION_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const json = await resp.json();
        if (json && typeof json.minimumVersion === 'string') {
          remoteConfig = {
            ...DEFAULT_CONFIG,
            ...json,
          };
          break;
        }
      }
    } catch {
      // Continue to next fallback
    }
  }

  const versionOutdated = isVersionOutdated(installedVersion, remoteConfig.minimumVersion);
  const buildOutdated =
    remoteConfig.minimumBuildNumber > 0 && installedBuild < remoteConfig.minimumBuildNumber;

  const isMandatory = (versionOutdated || buildOutdated) && remoteConfig.forceUpdate;
  const isRecommended =
    !isMandatory && isVersionOutdated(installedVersion, remoteConfig.latestVersion);

  return {
    needsUpdate: isMandatory || isRecommended,
    isMandatory,
    installedVersion,
    installedBuild,
    minimumVersion: remoteConfig.minimumVersion,
    latestVersion: remoteConfig.latestVersion,
    config: remoteConfig,
  };
}

/**
 * Open Solana Seeker dApp Store directly, falling back to Android market or browser.
 */
/**
 * Schemes that may be opened from a REMOTE-supplied URL.
 *
 * `customUrl` arrives in the version.json document fetched over the network, so
 * it is attacker-controlled if any of those hosts — or the old repo namespace —
 * is ever compromised. A version.json is also the one document that can force a
 * lockout, so it is the highest-value thing to hijack. An arbitrary URI passed
 * to `Linking.openURL` can launch another app's deep link or an `intent:`
 * redirect, so only the two schemes this feature legitimately needs are allowed.
 *
 * Prefix matching rather than `new URL()`: React Native's URL implementation is
 * historically partial, and the scheme check must not silently degrade here.
 */
const ALLOWED_URL_SCHEMES = ['https://', 'solanadappstore://'];

function isAllowedOpenUrl(raw: string): boolean {
  const value = raw.trim();
  // Reject embedded whitespace/control characters outright: several platforms
  // ignore everything before a newline, which is the classic scheme-check bypass.
  if (/[\s\u0000-\u001f]/.test(value)) return false;
  const lower = value.toLowerCase();
  return ALLOWED_URL_SCHEMES.some((prefix) => lower.startsWith(prefix));
}

export async function openDAppStore(customUrl?: string): Promise<void> {
  // A remote URL that fails the allowlist falls back to the built-in default
  // rather than being opened anyway.
  const dappStoreUri =
    customUrl && isAllowedOpenUrl(customUrl) ? customUrl : DEFAULT_CONFIG.dappStoreUrl;
  const marketUri = DEFAULT_CONFIG.marketUrl;
  const webFallback = DEFAULT_CONFIG.webUrl;

  if (Platform.OS === 'android') {
    try {
      const canOpen = await Linking.canOpenURL(dappStoreUri);
      if (canOpen) {
        await Linking.openURL(dappStoreUri);
        return;
      }
    } catch {
      // Continue to next fallback
    }

    try {
      const canOpenMarket = await Linking.canOpenURL(marketUri);
      if (canOpenMarket) {
        await Linking.openURL(marketUri);
        return;
      }
    } catch {
      // Continue to web fallback
    }
  }

  await Linking.openURL(webFallback).catch(() => {});
}
