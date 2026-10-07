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
          // Field whitelist: the config is unsigned, so only the update-gating
          // fields are accepted. dappStoreUrl/webUrl are deliberately NOT taken
          // from the remote — the modal renders them under a "Verified Release"
          // badge, so they are pinned constants only.
          remoteConfig = {
            ...DEFAULT_CONFIG,
            minimumVersion: json.minimumVersion,
            latestVersion:
              typeof json.latestVersion === 'string' ? json.latestVersion : DEFAULT_CONFIG.latestVersion,
            minimumBuildNumber:
              typeof json.minimumBuildNumber === 'number'
                ? json.minimumBuildNumber
                : DEFAULT_CONFIG.minimumBuildNumber,
            forceUpdate:
              json.forceUpdate === true || json.forceUpdate === false
                ? json.forceUpdate
                : DEFAULT_CONFIG.forceUpdate,
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
 *
 * `customUrl` arrives in the version.json document fetched over the network, so
 * it is attacker-controlled if any of those hosts is ever compromised — and a
 * version.json is the one document that can force a lockout, making it the
 * highest-value thing to hijack. `isAllowedUpdateUrl` below is what constrains
 * it; the allowlists live inside the function so they sit next to the check.
 */
export async function openDAppStore(customUrl?: string): Promise<void> {
  // Trust no remote URL: the version config is unsigned. Only well-known
  // app-store schemes and project-owned hosts are openable; anything else
  // falls back to the pinned constants.
  const ALLOWED_UPDATE_SCHEMES = new Set(['solanadappstore:', 'market:', 'appmarket:']);
  const ALLOWED_UPDATE_HOSTS = new Set([
    'play.google.com',
    'apps.apple.com',
    'clocklend.kikhaus.com',
    'kikhaus.com',
  ]);
  const isAllowedUpdateUrl = (u?: string): boolean => {
    if (!u) return false;
    // Reject embedded whitespace and control characters outright. Several
    // platforms ignore everything before a newline, which is the classic
    // scheme-check bypass, and it costs nothing to refuse them here.
    if (/[\s\u0000-\u001f]/.test(u)) return false;
    try {
      const parsed = new URL(u);
      return (
        ALLOWED_UPDATE_SCHEMES.has(parsed.protocol.toLowerCase()) ||
        ALLOWED_UPDATE_HOSTS.has(parsed.hostname.toLowerCase())
      );
    } catch {
      return false;
    }
  };

  const dappStoreUri = isAllowedUpdateUrl(customUrl) ? (customUrl as string) : DEFAULT_CONFIG.dappStoreUrl;
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
