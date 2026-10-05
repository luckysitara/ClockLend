import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Linking,
  AppState,
  AppStateStatus,
  StatusBar,
  Dimensions,
  useWindowDimensions,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { PublicKey } from '@solana/web3.js';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { Header } from './src/components/Header';
import { QuickStartBar } from './src/components/QuickStartBar';
import { HomeDashboardView } from './src/components/HomeDashboardView';
import { QuickHubView } from './src/components/QuickHubView';
import { P2PExpressView } from './src/components/P2PExpressView';
import { MerchantDesksView } from './src/components/MerchantDesksView';
import { ActiveOrdersView } from './src/components/ActiveOrdersView';
import { CreditProfileView } from './src/components/CreditProfileView';
import { ConnectWalletView } from './src/components/ConnectWalletView';
import { WalletAssetsModal } from './src/components/WalletAssetsModal';
import { TransactionNoticeModal, TransactionNoticeData } from './src/components/TransactionNoticeModal';
import { LeaderboardModal } from './src/components/LeaderboardModal';
import { JudgeBriefingModal } from './src/components/JudgeBriefingModal';
import { SplashScreenView } from './src/components/SplashScreenView';
import { ForceUpdateModal } from './src/components/ForceUpdateModal';
import { SecurityLockScreen, LockScreenMode } from './src/components/SecurityLockScreen';
import { SecurityLockdownView } from './src/components/SecurityLockdownView';
import { isLockEnabled, checkDeviceIntegrity, DeviceIntegrityResult } from './src/services/securityService';
import { checkAppVersion, VersionGateResult } from './src/services/versionGateService';
import { getXQuestStatus, X_REPUTATION_BPS_REWARD } from './src/services/questService';
import { syncLoanReminders, clearLoanReminders } from './src/services/loanReminders';
import * as SecureStore from 'expo-secure-store';
import {
  fetchLivePools,
  fetchLiveUserOrders,
  fetchLiveP2POffers,
  fetchLiveUserProfile,
  fetchLiveWalletAssets,
  buildBorrowTx,
  buildRepayTx,
  buildTriggerGracePeriodTx,
  buildCreateP2POfferTx,
  buildFundP2POfferTx,
  buildRepayPawnOfferTx,
  buildCancelPawnOfferTx,
  buildCreatePoolTx,
  buildStakeSkrTx,
  buildUnstakeSkrTx,
  buildDepositLiquidityTx,
  buildWithdrawLiquidityTx,
  buildClaimLoanDefaultTx,
  buildClaimPawnDefaultTx,
  buildTriggerPawnGraceTx,
  getCachedOrders,
  setCachedOrders,
  USDC_MAINNET_MINT,
  SKR_MINT,
  NATIVE_SOL_MINT,
  livePrices,
  fetchSkrYieldVault,
  fetchUserYieldPosition,
  buildClaimSkrYieldTx,
  SkrYieldVaultState,
  UserYieldPositionState,
  // Round-14 audit remediation helpers (program-exact math + live reads)
  calculateOriginationFee,
  calculateExactInterestDue,
  formatUsdcMicro,
  fetchOnChainLoanByPDA,
  describeTransactionError,
  isNativeSolCollateralName,
  subscribeToUserLoans,
  GENESIS_MAINNET_POOL,
} from './src/solana/onChainService';
import { getLoanPDA, getPoolPDA } from './src/solana/program';
import {
  signAndSendSeekerTransaction,
  deriveSkrUsername,
  SeekerSession,
  saveSeekerSession,
  getSavedSeekerSession,
  clearSavedSeekerSession,
} from './src/solana/seekerWallet';
import { LendingPool, LoanOrder, P2POffer, OfferStatus, UserProfile, WalletAssets, SolanaNetwork } from './src/types';

type Tab = 'HOME' | 'BORROW' | 'HUB' | 'MARKET' | 'LOANS' | 'PROFILE';

/**
 * Outcome of the last COMPLETED read for one protocol slice. `loadProtocolData`
 * uses Promise.allSettled, so a rejected fetch leaves that slice's previous
 * value in place and reports nothing — the status is the only place a failure
 * is visible. 'loading' means no completed result exists for the current
 * session/network yet; it is never used to represent progress.
 */
type SliceStatus = 'loading' | 'ok' | 'error';

const INITIAL_COMMUNITY_POOLS: LendingPool[] = [GENESIS_MAINNET_POOL];
const INITIAL_COMMUNITY_OFFERS: P2POffer[] = [];

function MainApp() {
  const { colors, mode } = useTheme();

  // Small-screen layout metrics (computed per render so rotation / window
  // resizes are picked up). react-native-safe-area-context is not installed,
  // so the Android gesture/nav-bar inset is derived from the screen-vs-window
  // height difference.
  const windowH = useWindowDimensions().height;
  const screenH = Dimensions.get('screen').height;
  const bottomInset = Math.max(0, screenH - windowH);
  const statusBarInset = StatusBar.currentHeight || 24;

  // Seeker Wallet & Network Session
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockScreenMode, setLockScreenMode] = useState<LockScreenMode>('unlock');
  const [session, setSession] = useState<SeekerSession | null>(null);
  // Mainnet-only app: the devnet toggle was removed (round-14 audit M-7).
  const selectedNetwork: SolanaNetwork = 'mainnet-beta';
  const [activeTab, setActiveTab] = useState<Tab>('HOME');
  // First-time Quick-Start guided bar (post-auth feature discovery, shown once per device)
  const [showQuickStart, setShowQuickStart] = useState<boolean>(false);
  const [borrowPreset, setBorrowPreset] = useState<string | null>(null);
  // Desk the user explicitly picked in the Markets screen. While set, the
  // Borrow screen borrows from THIS desk instead of auto-routing to the
  // lowest-APR funded desk. Cleared on tab-bar re-entry and after a loan.
  const [selectedPool, setSelectedPool] = useState<LendingPool | null>(null);
  const [transactionNotice, setTransactionNotice] = useState<TransactionNoticeData | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [showJudgeBriefing, setShowJudgeBriefing] = useState<boolean>(false);
  const [integrity, setIntegrity] = useState<DeviceIntegrityResult | null>(null);
  const [versionGateResult, setVersionGateResult] = useState<VersionGateResult | null>(null);
  const [questBonusBps, setQuestBonusBps] = useState<number>(0);
  // Suppresses the auto-relock that otherwise fires when the MWA wallet
  // authorization backgrounds and re-foregrounds the app right after unlock.
  const lastUnlockAtRef = useRef<number>(0);

  // Show the Quick-Start bar once per device after the first wallet connect, unless dismissed.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    SecureStore.getItemAsync('clocklend_quickstart_dismissed_v1')
      .then((val) => {
        if (!cancelled) setShowQuickStart(val !== '1');
      })
      .catch(() => {
        if (!cancelled) setShowQuickStart(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.publicKey]);

  const handleQuickStartDismiss = async () => {
    setShowQuickStart(false);
    try {
      await SecureStore.setItemAsync('clocklend_quickstart_dismissed_v1', '1');
    } catch {}
  };

  const handleQuickStartPreset = (amt: string) => {
    setBorrowPreset(amt);
    setActiveTab('BORROW');
  };



  const handleJudgeBriefingClose = async () => {
    setShowJudgeBriefing(false);
    try {
      await SecureStore.setItemAsync('clocklend_judge_briefing_seen_v1', '1');
    } catch {}
  };

  // Auto-lock, hardware integrity check, remote version gating, and saved wallet session restoration on app launch
  useEffect(() => {
    checkInitialLock();
    checkDeviceIntegrity().then((res) => setIntegrity(res));
    checkAppVersion().then((res) => setVersionGateResult(res));

    // Restore saved wallet session so user doesn't have to reconnect every time
    getSavedSeekerSession().then((saved) => {
      if (saved) {
        setSession(saved);
      }
    });

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkAppResumeLock();
        checkDeviceIntegrity().then((res) => setIntegrity(res));
        checkAppVersion().then((res) => setVersionGateResult(res));
      }
    });
    return () => sub.remove();
  }, []);

  // Fetch social quest status whenever wallet session changes
  useEffect(() => {
    if (session?.publicKey) {
      getXQuestStatus(session.publicKey.toBase58()).then((status) => {
        setQuestBonusBps(status.completed ? X_REPUTATION_BPS_REWARD : 0);
      });
    } else {
      setQuestBonusBps(0);
    }
  }, [session?.publicKey]);

  const checkInitialLock = async () => {
    const enabled = await isLockEnabled();
    if (enabled) {
      setLockScreenMode('unlock');
      setIsLocked(true);
    }
  };

  const checkAppResumeLock = async () => {
    // Skip the relock when the user unlocked within the last 90 seconds
    // (covers the wallet-authorization background/foreground bounce).
    if (Date.now() - lastUnlockAtRef.current < 90_000) return;
    const enabled = await isLockEnabled();
    if (enabled) {
      setLockScreenMode('unlock');
      setIsLocked(true);
    }
  };

  // Handle incoming deep links (clocklend://circle/{id}, clocklend://pawn/{id}, clocklend://borrow)
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) processDeepLink(url);
    });

    const sub = Linking.addEventListener('url', (event) => {
      if (event?.url) processDeepLink(event.url);
    });

    return () => sub.remove();
  }, []);

  const processDeepLink = (rawUrl: string) => {
    console.log('[DeepLink] Received URL:', rawUrl);
    try {
      // The handler only navigates tabs and shows toasts — it never signs or
      // moves funds. Still validate before acting: exact scheme, allowlisted
      // actions, and base58-safe target ids so a hostile link can at most
      // switch a tab, never feed a malformed id into the UI.
      if (!/^clocklend:\/\/[a-z0-9/]+$/i.test(rawUrl)) {
        console.warn('[DeepLink] Rejected malformed URL:', rawUrl);
        return;
      }
      const clean = rawUrl.replace(/^clocklend:\/\//i, '');
      const [pathAndQuery] = clean.split('?');
      const segments = pathAndQuery.split('/').filter(Boolean);
      const action = segments[0]?.toLowerCase();
      const targetId = segments[1];
      const allowedActions = ['circle', 'pool', 'pawn', 'pawns', 'borrow', 'loans', 'orders', 'profile', 'account'];
      if (!allowedActions.includes(action)) {
        console.warn('[DeepLink] Rejected unknown action:', action);
        return;
      }
      if (targetId && !/^[1-9A-HJ-NP-Za-km-z]{1,44}$/.test(targetId)) {
        console.warn('[DeepLink] Rejected invalid target id:', targetId);
        return;
      }

      if (action === 'circle' || action === 'pool') {
        setActiveTab('MARKET');
        showToast(targetId ? `Opened Community Circle #${targetId}` : 'Opened Community Desks');
      } else if (action === 'pawn' || action === 'pawns') {
        setActiveTab('MARKET');
        showToast(targetId ? `Viewing P2P Pawn #${targetId}` : 'Viewing Pawn Deck');
      } else if (action === 'borrow') {
        setActiveTab('BORROW');
        showToast('Instant Express Borrow Desk');
      } else if (action === 'loans' || action === 'orders') {
        setActiveTab('LOANS');
        showToast('Viewing Active Loan Orders');
      } else if (action === 'profile' || action === 'account') {
        setActiveTab('PROFILE');
      }
    } catch (e) {
      console.warn('[DeepLink] Parse error:', e);
    }
  };

  const [pools, setPools] = useState<LendingPool[]>(INITIAL_COMMUNITY_POOLS);
  const poolsRef = useRef<LendingPool[]>(INITIAL_COMMUNITY_POOLS);
  const [orders, setOrders] = useState<LoanOrder[]>([]);
  const ordersRef = useRef<LoanOrder[]>([]);
  const offersRef = useRef<P2POffer[]>(INITIAL_COMMUNITY_OFFERS);
  const [offers, setOffers] = useState<P2POffer[]>(INITIAL_COMMUNITY_OFFERS);

  useEffect(() => {
    poolsRef.current = pools;
  }, [pools]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skrYieldVault, setSkrYieldVault] = useState<SkrYieldVaultState | undefined>(undefined);
  const [userYieldPosition, setUserYieldPosition] = useState<UserYieldPositionState | undefined>(undefined);
  const [walletAssets, setWalletAssets] = useState<WalletAssets>({
    network: 'mainnet-beta',
    solBalance: 0,
    usdcBalance: 0,
    skrBalance: 0,
    bonkBalance: 0,
    hasSeekerGenesisToken: false, // set on-chain by fetchLiveWalletAssets; never overclaim before RPC confirms
    totalUsdValue: 0,
    tokenList: [],
  });
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isLoadingPools, setIsLoadingPools] = useState<boolean>(false);
  // Per-slice outcome, tracked separately from `isLoadingPools` ("a load is in
  // flight right now"). A retry deliberately leaves the previous 'error' in
  // place so the screen keeps saying what failed while it retries.
  const [ordersStatus, setOrdersStatus] = useState<SliceStatus>('loading');
  const [poolsStatus, setPoolsStatus] = useState<SliceStatus>('loading');
  const [offersStatus, setOffersStatus] = useState<SliceStatus>('loading');
  const [showAssetsModal, setShowAssetsModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Fast, independent wallet asset balance query
  const refreshWalletAssets = async (userPubkey: PublicKey, net: SolanaNetwork) => {
    try {
      const assets = await fetchLiveWalletAssets(userPubkey, net);
      // Balances are RPC-authoritative — the chain has already moved loan
      // disbursements and collateral, so no local adjustments are applied.
      setWalletAssets(assets);
      setSolBalance(assets.solBalance);
    } catch (e) {
      console.log('Error refreshing assets:', e);
    }
  };

  // Concurrent loading of protocol data
  const loadProtocolData = async (userPubkey: PublicKey, skrHandle: string, net: SolanaNetwork = selectedNetwork) => {
    try {
      setIsLoadingPools(true);
      const poolsPromise = fetchLivePools(net);
      const [livePools, profile, liveOffers, yieldVault, yieldPosition] = await Promise.allSettled([
        poolsPromise,
        fetchLiveUserProfile(userPubkey, skrHandle, net),
        fetchLiveP2POffers(net),
        fetchSkrYieldVault(net, USDC_MAINNET_MINT),
        fetchUserYieldPosition(net, userPubkey, USDC_MAINNET_MINT),
      ]);

      const resolvedPools = livePools.status === 'fulfilled' ? livePools.value : poolsRef.current;
      const liveOrders = await fetchLiveUserOrders(userPubkey, net, resolvedPools)
        .then((val) => ({ status: 'fulfilled' as const, value: val }))
        .catch((err) => ({ status: 'rejected' as const, reason: err }));

      // Derive each rendered slice's status from the settled result itself.
      // allSettled never rejects, so this is the only place a failed slice read
      // can be recorded — the `catch` below is unreachable for a plain RPC
      // rejection.
      setPoolsStatus(livePools.status === 'fulfilled' ? 'ok' : 'error');
      setOrdersStatus(liveOrders.status === 'fulfilled' ? 'ok' : 'error');
      setOffersStatus(liveOffers.status === 'fulfilled' ? 'ok' : 'error');

      if (livePools.status === 'fulfilled') {
        setPools(livePools.value);
        poolsRef.current = livePools.value;
      }
      if (profile.status === 'fulfilled') setUserProfile(profile.value);
      if (yieldVault.status === 'fulfilled') setSkrYieldVault(yieldVault.value);
      if (yieldPosition.status === 'fulfilled') setUserYieldPosition(yieldPosition.value);

      if (liveOffers.status === 'fulfilled') {
        const onChainOffers = liveOffers.value;
        const onChainIds = new Set(onChainOffers.map((o) => o.id));
        const sessionActive = offersRef.current.filter((o) => !onChainIds.has(o.id));
        const combined = [...sessionActive, ...onChainOffers];
        offersRef.current = combined;
        setOffers(combined);
      }

      if (liveOrders.status === 'fulfilled') {
        const onChainOrders = liveOrders.value;
        ordersRef.current = onChainOrders;
        setOrders(onChainOrders);
        await setCachedOrders(userPubkey.toBase58(), onChainOrders, net);
        // Recalculate assets with final verified on-chain orders
        await refreshWalletAssets(userPubkey, net);
      }
    } catch (e) {
      console.log('Error loading protocol data:', e);
      // Reachable when the load itself threw before any slice settled (a
      // synchronous throw from a fetcher, or a throw from the cache write
      // below). Any slice still sitting at 'loading' has no verified result, so
      // it must become 'error' rather than a spinner that never resolves; a
      // slice that already settled above keeps its real outcome.
      setPoolsStatus((s) => (s === 'loading' ? 'error' : s));
      setOrdersStatus((s) => (s === 'loading' ? 'error' : s));
      setOffersStatus((s) => (s === 'loading' ? 'error' : s));
    } finally {
      setIsLoadingPools(false);
    }
  };

  // Retry for the Loans / Desks screens: re-runs the same per-slice load for the
  // CURRENT session and network. Deliberately does not reset a slice's status —
  // the screen keeps showing what failed, with the retry button reporting that
  // the new attempt is in flight, until that attempt settles.
  const retryProtocolData = () => {
    if (!session?.publicKey) return;
    loadProtocolData(session.publicKey, session.skrHandle, selectedNetwork).catch(() => {});
  };

  // Load public pools and offers immediately on startup and network change (independent of wallet auth)
  useEffect(() => {
    let cancelled = false;
    setIsLoadingPools(true);
    Promise.allSettled([
      fetchLivePools(selectedNetwork),
      fetchLiveP2POffers(selectedNetwork),
    ])
      .then(([poolsRes, offersRes]) => {
        if (cancelled) return;
        if (poolsRes.status === 'fulfilled' && poolsRes.value) {
          setPools(poolsRes.value);
          poolsRef.current = poolsRes.value;
          setPoolsStatus('ok');
        }
        if (offersRes.status === 'fulfilled' && offersRes.value) {
          setOffers(offersRes.value);
          offersRef.current = offersRes.value;
          setOffersStatus('ok');
        }
      })
      .catch((err) => {
        console.warn('Initial public market fetch notice:', err);
        if (!cancelled) setPoolsStatus('error');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedNetwork]);

  // When wallet connects or network changes, trigger instant cache hydration, asset query, and parallel protocol fetch
  useEffect(() => {
    if (session?.publicKey) {
      const pubkey = session.publicKey;
      const pubkeyStr = pubkey.toBase58();

      // A different wallet or network invalidates every previous slice result:
      // nothing has been read for THIS subject yet, and a previous session's
      // 'ok' must not be inherited.
      setOrdersStatus('loading');
      setPoolsStatus('loading');
      setOffersStatus('loading');

      // 1. Fast 0ms local hybrid cache hydration (strictly isolated by network).
      // These rows are UNCONFIRMED until the chain read below completes, so
      // they are flagged for the UI ("last known — not confirmed").
      getCachedOrders(pubkeyStr, selectedNetwork).then((cached) => {
        if (cached && cached.length > 0) {
          const staleRows = cached.map((o) => ({ ...o, isStale: true }));
          ordersRef.current = staleRows;
          setOrders(staleRows);
        } else {
          ordersRef.current = [];
          setOrders([]);
        }
        // 2. Query wallet assets (incorporating activeBorrowAmount immediately)
        refreshWalletAssets(pubkey, selectedNetwork);
      });

      // 3. Concurrently pull ground-truth blockchain state
      loadProtocolData(pubkey, session.skrHandle, selectedNetwork);
    }
  }, [session?.publicKey, selectedNetwork]);

  // Real-time market & protocol data poller every 12s so desk & pawn counts are live on-chain
  useEffect(() => {
    const interval = setInterval(() => {
      if (session?.publicKey) {
        loadProtocolData(session.publicKey, session.skrHandle, selectedNetwork).catch(() => {});
      } else {
        fetchLivePools(selectedNetwork)
          .then((p) => {
            if (p && p.length > 0) {
              setPools(p);
              poolsRef.current = p;
            }
          })
          .catch(() => {});
        fetchLiveP2POffers(selectedNetwork)
          .then((o) => {
            if (o) {
              setOffers(o);
              offersRef.current = o;
            }
          })
          .catch(() => {});
      }
    }, 12_000);
    return () => clearInterval(interval);
  }, [session?.publicKey, selectedNetwork]);

  // M-8: watch the borrower's own loan PDAs. A program-side change (grace
  // period triggered, repayment, default claim) pushes an account update, so
  // the loans view re-reads the chain instead of showing a stale local row.
  const orderWatchKey = orders
    .filter((o) => o.poolPubkey)
    .map((o) => `${o.id}@${o.poolPubkey}`)
    .join(',');
  const lastLoanPushRef = useRef<number>(0);

  useEffect(() => {
    if (!session?.publicKey || !orderWatchKey) return;
    const borrower = session.publicKey;
    const watched = orders
      .filter((o) => o.poolPubkey)
      .map((o) => ({ id: o.id, poolPubkey: o.poolPubkey }));
    const unsubscribe = subscribeToUserLoans(borrower, watched, selectedNetwork, () => {
      // Coalesce bursts (a single instruction can emit several notifications).
      const now = Date.now();
      if (now - lastLoanPushRef.current < 4_000) return;
      lastLoanPushRef.current = now;
      fetchLiveUserOrders(borrower, selectedNetwork, poolsRef.current)
        .then((live) => {
          ordersRef.current = live;
          setOrders(live);
        })
        .catch((err) => console.warn('[Loans] live refresh failed:', err));
    });
    return unsubscribe;
    // orderWatchKey encodes the id+pool of every watched loan; re-subscribing
    // only happens when that set actually changes.
  }, [session?.publicKey, orderWatchKey, selectedNetwork]);

  // Logout handler with sleek toast feedback (no annoying OS alert popup)
  // Due-date reminders. A lending app has exactly one event that must pull a
  // user back — the date they owe money — and this is it. Reconciled whenever
  // the loan set changes so a repaid loan can never produce a stale reminder.
  // Never throws, and degrades to a no-op in a build without the native module.
  useEffect(() => {
    if (!session?.publicKey) return;
    void syncLoanReminders(orders);
  }, [orders, session?.publicKey]);

  const handleDisconnect = () => {
    // Drop this user's scheduled reminders so the next one does not inherit them.
    void clearLoanReminders();
    void clearSavedSeekerSession();
    setShowAssetsModal(false);
    const handle = session?.skrHandle ? `@${session.skrHandle}` : 'wallet';
    setSession(null);
    setOrders([]);
    ordersRef.current = [];
    offersRef.current = INITIAL_COMMUNITY_OFFERS;
    setOffers(INITIAL_COMMUNITY_OFFERS);
    setUserProfile(null);
    setSolBalance(0);
    setWalletAssets({
      network: 'mainnet-beta',
      solBalance: 0,
      usdcBalance: 0,
      skrBalance: 0,
      bonkBalance: 0,
      hasSeekerGenesisToken: false,
      totalUsdValue: 0,
      tokenList: [],
    });
    showToast(`Logged out of ${handle}`);
  };

  // Execute real Borrow transaction
  const handleBorrow = async (
    borrowAmount: number,
    collateralUnits: number,
    collateralName: string,
    pool: LendingPool,
    durationDays: number
  ) => {
    if (!session) return;

    // Disallow borrowing from own desk
    if (pool.authority.toLowerCase() === session.publicKey.toBase58().toLowerCase()) {
      setTransactionNotice({
        type: 'error',
        title: 'Cannot Borrow From Own Desk',
        subtitle: 'You are the authority of this lending desk. Borrowing from your own desk is not permitted.',
        primaryBtnText: 'Dismiss',
      });
      return;
    }

    // C-3: never sign a borrow the program will reject for lack of liquidity
    // (processor.rs:1348). The desk must cover the full principal.
    if (pool.totalLiquidity < borrowAmount) {
      setTransactionNotice({
        type: 'error',
        title: 'This Pool Has No Liquidity Yet',
        subtitle:
          pool.totalLiquidity > 0
            ? `This desk currently has $${pool.totalLiquidity.toLocaleString()} USDC of liquidity, which is less than the $${borrowAmount.toLocaleString()} requested. Try a smaller amount or another desk.`
            : 'This desk has not been funded by its authority yet, so there is nothing to borrow. Pick another desk or check back later.',
        primaryBtnText: 'Dismiss',
      });
      return;
    }

    try {
      const poolAuthority = new PublicKey(pool.authority);
      // L-7: one collateral-type test shared with the tx builder.
      const isSol = isNativeSolCollateralName(collateralName);
      const collateralBaseUnits = isSol
        ? Math.round(collateralUnits * 1_000_000_000)
        : Math.round(collateralUnits * 1_000_000);
      const isPoolLiquid = pool.totalLiquidity >= borrowAmount;

      // Clamp the selected term into the pool's on-chain duration bounds so the
      // signed loan matches what the UI promised.
      const clampedDays = Math.min(
        Math.max(durationDays, pool.minDurationDays),
        pool.maxDurationDays
      );
      // H-3: what the program withholds from the disbursement.
      const grossMicro = BigInt(Math.round(borrowAmount * 1_000_000));
      const origination = calculateOriginationFee(grossMicro, isSol);

      const { tx, escrowPDA, loanId, loanPDA } = await buildBorrowTx(
        session.publicKey,
        poolAuthority,
        pool.id,
        borrowAmount,
        collateralBaseUnits,
        clampedDays,
        collateralName,
        isPoolLiquid,
        new PublicKey(pool.liquidityMint),
        selectedNetwork,
        // M-6: deterministic id; H-5: carry the pool-scoped feeds when the desk
        // pinned its own oracle PDAs.
        { poolLoansOriginated: pool.loansOriginated, hasCustomOracle: pool.hasCustomOracle }
      );

      // 1. Sign transaction with Seeker Hardware / MWA
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('Borrow tx confirmed on-chain:', sig);

      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // 2. H-4/M-6: read the loan account back. The program's stored
      // interest_due (exact u128 floor math, processor.rs:1926-1935), due_time
      // and loan_id are the ground truth — the float estimate and the
      // pre-signing id are only fallbacks for a failed read.
      const termDays = Math.min(Math.max(durationDays, pool.minDurationDays), pool.maxDurationDays);
      const chainLoan = await fetchOnChainLoanByPDA(loanPDA, selectedNetwork);
      const confirmedLoanId = chainLoan?.loanId ?? loanId;
      const principalMicro = chainLoan ? chainLoan.principalMicro : grossMicro;
      const principalAmount = Number(principalMicro) / 1_000_000;
      const interestMicro = chainLoan
        ? chainLoan.interestDueMicro
        : calculateExactInterestDue(
            grossMicro,
            pool.interestRateBps,
            termDays * 86400,
            userProfile?.aprDiscount ?? 0
          );
      const interestDue = Number(interestMicro) / 1_000_000;
      const nowSec = Math.floor(Date.now() / 1000);
      const dueTime =
        chainLoan && chainLoan.dueTime > 0 ? chainLoan.dueTime : nowSec + termDays * 86400;
      const collateralMintStr = (isSol ? NATIVE_SOL_MINT : SKR_MINT).toBase58();
      const newOrder: LoanOrder = {
        id: confirmedLoanId,
        poolId: pool.id,
        poolName: pool.name,
        borrower: session.publicKey.toBase58(),
        principalAmount,
        collateralName: chainLoan?.collateralName ?? `${collateralUnits.toFixed(isSol ? 2 : 0)} ${collateralName}`,
        collateralMint: chainLoan?.collateralMint ?? collateralMintStr,
        collateralAmount: chainLoan?.collateralAmount ?? collateralUnits,
        interestDue,
        originationTime: chainLoan?.originationTime ?? nowSec,
        dueTime,
        gracePeriodExpires: chainLoan?.gracePeriodExpires ?? 0,
        status: chainLoan?.status ?? 'Active',
        txSignature: sig,
        escrowAddress: escrowPDA.toBase58(),
        poolPubkey: chainLoan?.poolPubkey,
        solscanUrl,
        // The row is only "live" once the loan PDA has been read back.
        isStale: !chainLoan,
      };

      ordersRef.current = [newOrder, ...ordersRef.current.filter((o) => o.id !== confirmedLoanId)];
      setOrders(ordersRef.current);
      await setCachedOrders(session.publicKey.toBase58(), ordersRef.current, selectedNetwork);

      // 3. Refresh assets AND the profile/pools from the chain — the borrow
      // moved the disbursement, the collateral and (for SKR-bond borrowers)
      // the locked_skr that drives the APR discount.
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      loadProtocolData(session.publicKey, session.skrHandle, selectedNetwork).catch(() => {});

      // 4. Show sleek production transaction notice (net of the origination fee)
      const feePct = (origination.feeBps / 100).toFixed(2);
      setTransactionNotice({
        type: 'borrow',
        title: 'Loan Disbursed on Solana!',
        subtitle: `Received $${formatUsdcMicro(origination.netMicro)} USDC (gross $${formatUsdcMicro(principalMicro)} less the ${feePct}% origination fee of $${formatUsdcMicro(origination.feeMicro)}) with ${collateralUnits} ${collateralName} locked in escrow. Interest due at maturity: $${formatUsdcMicro(interestMicro)} USDC.`,
        amount: `$${formatUsdcMicro(origination.netMicro)} USDC`,
        collateral: `${collateralUnits} ${collateralName}`,
        txSignature: sig,
        escrowAddress: escrowPDA.toBase58(),
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Go to Loans',
        onSecondaryPress: () => setActiveTab('LOANS'),
      });

      // 5. Immediately switch to LOANS tab (the desk selection ends with the loan)
      setSelectedPool(null);
      setActiveTab('LOANS');
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Borrow Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('Borrow transaction failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Transaction Notice',
        // C-3: explain stale feeds / empty pools in plain language instead of
        // surfacing a raw custom-program-error dump.
        subtitle: describeTransactionError(err),
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Execute real Repay transaction
  const handleRepay = async (order: LoanOrder) => {
    if (!session) return;

    // NEW-2: prefer the loan's actual pool pubkey (parsed from the loan PDA);
    // only fall back to the menu-driven (authority, poolId) lookup for legacy
    // cached orders that predate the poolPubkey field.
    const poolPubkeyOverride = order.poolPubkey ? new PublicKey(order.poolPubkey) : undefined;
    const matchingPool = poolPubkeyOverride ? undefined : pools.find((p) => p.id === order.poolId);
    if (!poolPubkeyOverride && !matchingPool) {
      setTransactionNotice({
        type: 'error',
        title: 'Pool Authority Not Found',
        subtitle: `Could not determine pool authority for Pool #${order.poolId}.`,
        primaryBtnText: 'Dismiss',
      });
      return;
    }
    const poolAuthority = matchingPool ? new PublicKey(matchingPool.authority) : PublicKey.default;
    // Fallback only: buildRepayTx reads the exact amount from the loan account.
    const totalDue = order.principalAmount + order.interestDue;

    try {
      const tx = await buildRepayTx(
        session.publicKey,
        poolAuthority,
        order.poolId,
        order.id,
        totalDue,
        true,
        order.collateralName,
        poolPubkeyOverride,
        matchingPool ? new PublicKey(matchingPool.liquidityMint) : undefined
      );

      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Mark order as repaid (moves from Active to History)
      ordersRef.current = ordersRef.current.map((o) =>
        o.id === order.id
          ? { ...o, status: 'Repaid', txSignature: sig, solscanUrl, repaidAt: Date.now() }
          : o
      );
      setOrders(ordersRef.current);
      await setCachedOrders(session.publicKey.toBase58(), ordersRef.current, selectedNetwork);

      // Return collateral to wallet and deduct repaid USDC (optimistic — the
      // chain read below overwrites these figures with ground truth)
      setWalletAssets((prev) => {
        const isSol = isNativeSolCollateralName(order.collateralName);
        const isSkr = !isSol;
        const currentUsdc = Math.max(0, parseFloat((prev.usdcBalance - totalDue).toFixed(2)));
        const currentSol = isSol ? parseFloat((prev.solBalance + order.collateralAmount).toFixed(3)) : prev.solBalance;
        const currentSkr = isSkr ? parseFloat((prev.skrBalance + order.collateralAmount).toFixed(0)) : prev.skrBalance;
        return {
          ...prev,
          usdcBalance: currentUsdc,
          solBalance: currentSol,
          skrBalance: currentSkr,
          totalUsdValue: parseFloat((currentSol * livePrices.sol + currentUsdc + currentSkr * livePrices.skr).toFixed(2)),
        };
      });

      // L-6/C-2: no local reputation or discount arithmetic. The program bumps
      // reputation by 50, capped at 10000 (processor.rs:2644) — and a profile
      // STARTS at 10000 (processor.rs:709), so the real gain can be zero. The
      // profile is re-read from its PDA and the notice states no delta.
      const freshProfile = await fetchLiveUserProfile(
        session.publicKey,
        session.skrHandle,
        selectedNetwork
      );
      setUserProfile(freshProfile);
      // Balances and pool state are chain truth after a repayment.
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      loadProtocolData(session.publicKey, session.skrHandle, selectedNetwork).catch(() => {});

      setTransactionNotice({
        type: 'repay',
        title: 'Loan Repaid & Released!',
        subtitle: `Successfully repaid $${totalDue} USDC. Your ${order.collateralName} has been unlocked from escrow back to your wallet. Loan completed — your on-chain credit profile was updated.`,
        amount: `$${totalDue} USDC`,
        collateral: order.collateralName,
        // No reputationGain here: the program applies
        // `reputation_score.saturating_add(50).min(10000)` (processor.rs:2644,
        // :2656) to a score that starts at 10000, so for a user at the starting
        // score the gain is exactly ZERO. Asserting "+50 pts" (or any fixed
        // number) would state a gain the program may never apply.
        txSignature: sig,
        escrowAddress: order.escrowAddress,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Repay Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      setTransactionNotice({
        type: 'error',
        title: 'Repay Notice',
        subtitle: err?.message || 'Repayment failed. Please check your balance and try again.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Execute real on-chain Trigger Grace Period transaction
  const handleTriggerGrace = async (orderId: number) => {
    if (!session) return;

    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    try {
      const matchingPool = pools.find((p) => p.id === order.poolId);
      const poolPDA = order.poolPubkey
        ? new PublicKey(order.poolPubkey)
        : matchingPool
        ? getPoolPDA(new PublicKey(matchingPool.authority), order.poolId)[0]
        : getPoolPDA(session.publicKey, 1)[0];

      const [loanPDA] = getLoanPDA(poolPDA, session.publicKey, order.id);

      const tx = await buildTriggerGracePeriodTx(session.publicKey, loanPDA, poolPDA);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      ordersRef.current = ordersRef.current.map((o) =>
        o.id === orderId ? { ...o, status: 'InGracePeriod' as const, txSignature: sig, solscanUrl } : o
      );
      setOrders(ordersRef.current);
      if (session?.publicKey) {
        await setCachedOrders(session.publicKey.toBase58(), ordersRef.current, selectedNetwork);
      }
      setTransactionNotice({
        type: 'grace',
        title: 'Social Grace Activated On-Chain',
        subtitle: '24-hour grace window started on-chain. Circle peers have priority buyout rights before any liquidation.',
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Understood',
        txSignature: sig,
        solscanUrl,
      });
    } catch (err: any) {
      console.warn('Trigger grace error:', err);
      // The transaction failed: nothing changed on-chain. Do NOT mark the
      // order InGracePeriod locally — the cached state would lie across
      // restarts while the chain still shows Active.
      setTransactionNotice({
        type: 'error',
        title: 'Grace Period Not Activated',
        subtitle: err?.message || 'Could not start the grace period on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Execute real on-chain P2P Pawn Listing transaction
  const handleCreatePawnOffer = async (
    name: string,
    amt: number,
    prof: number,
    days: number
  ) => {
    if (!session) return;

    const offerId = Math.floor(1000 + Math.random() * 9000);

    try {
      const { tx, escrowPDA } = await buildCreateP2POfferTx(
        session.publicKey,
        offerId,
        name,
        amt,
        prof,
        days
      );

      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('P2P pawn offer created on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      const solMatch = name.match(/([0-9]*\.?[0-9]+)\s*SOL/i);
      const skrMatch = name.match(/([0-9]*\.?[0-9]+)\s*SKR/i);
      const parsedSol = solMatch ? parseFloat(solMatch[1]) : 0;
      const parsedSkr = skrMatch ? parseFloat(skrMatch[1]) : 0;
      const parsedUnits = solMatch ? parsedSol : (skrMatch ? parsedSkr : 1);
      const isNft = name.toLowerCase().includes('nft') || name.toLowerCase().includes('monke');

      const newOffer: P2POffer = {
        id: offerId,
        creator: session.publicKey.toBase58(),
        collateralName: name,
        collateralType: isNft ? 'NFT' : 'Token',
        collateralAmount: parsedUnits,
        requestedAmount: amt,
        interestOffered: prof,
        durationDays: days,
        createdAt: Math.floor(Date.now() / 1000),
        status: 'Open',
        txSignature: sig,
        escrowAddress: escrowPDA.toBase58(),
        solscanUrl,
      };

      offersRef.current = [newOffer, ...offersRef.current.filter((o) => o.id !== offerId)];
      setOffers(offersRef.current);

      // Deduct SOL or SKR for collateral or escrow rent
      setWalletAssets((prev) => {
        const deductSol = solMatch ? parsedSol : 0.005;
        const newSol = Math.max(0, parseFloat((prev.solBalance - deductSol).toFixed(3)));
        const newSkr = skrMatch ? Math.max(0, Math.round(prev.skrBalance - parsedSkr)) : prev.skrBalance;
        return {
          ...prev,
          solBalance: newSol,
          skrBalance: newSkr,
          totalUsdValue: parseFloat((newSol * livePrices.sol + prev.usdcBalance + newSkr * livePrices.skr).toFixed(2)),
        };
      });

      setTransactionNotice({
        type: 'borrow',
        title: 'P2P Pawn Listed On-Chain!',
        subtitle: `Asset "${name}" escrowed. Open for peer funding on Circle Deck.`,
        amount: `$${amt} USDC`,
        collateral: name,
        txSignature: sig,
        escrowAddress: escrowPDA.toBase58(),
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'View P2P Desks',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Listing Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      setTransactionNotice({
        type: 'error',
        title: 'Listing Notice',
        subtitle: err?.message || 'Failed to list pawn offer on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Execute real on-chain P2P Pawn Funding transaction
  const handleFundPawnOffer = async (offerId: number) => {
    if (!session) return;

    const targetOffer = offers.find((o) => o.id === offerId);
    if (!targetOffer) return;

    if (targetOffer.status !== 'Open') {
      Alert.alert('Offer Unavailable', 'This pawn offer is already funded or closed.');
      return;
    }

    try {
      const tx = await buildFundP2POfferTx(session.publicKey, targetOffer);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('P2P pawn funded on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      offersRef.current = offersRef.current.map((o) =>
        o.id === offerId
          ? {
              ...o,
              status: 'Funded' as OfferStatus,
              funder: session.publicKey.toBase58(),
              txSignature: sig,
              solscanUrl,
            }
          : o
      );
      setOffers([...offersRef.current]);

      // Deduct funded principal from user's USDC balance
      setWalletAssets((prev) => {
        const newUsdc = Math.max(0, parseFloat((prev.usdcBalance - targetOffer.requestedAmount).toFixed(2)));
        return {
          ...prev,
          usdcBalance: newUsdc,
          totalUsdValue: parseFloat((prev.solBalance * livePrices.sol + newUsdc + prev.skrBalance * livePrices.skr).toFixed(2)),
        };
      });

      // Funding a pawn offer does NOT move reputation on-chain (the program
      // only credits +50 on a completed loan repayment — saturating_add(50).min(10000),
      // processor.rs:2644 and :2656 — so a fresh 10,000 profile gains nothing),
      // so no local score bump is applied — the profile is re-read instead.
      const freshProfile = await fetchLiveUserProfile(
        session.publicKey,
        session.skrHandle,
        selectedNetwork
      );
      setUserProfile(freshProfile);

      setTransactionNotice({
        type: 'repay',
        title: 'P2P Pawn Funded!',
        subtitle: `Funded $${targetOffer.requestedAmount} USDC for Pawn #${offerId}. You will receive +$${targetOffer.interestOffered} USDC yield upon borrower repayment.`,
        amount: `$${targetOffer.requestedAmount} USDC`,
        collateral: targetOffer.collateralName,
        txSignature: sig,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Funding Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      setTransactionNotice({
        type: 'error',
        title: 'Funding Notice',
        subtitle: err?.message || 'Failed to fund pawn offer on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Execute real on-chain P2P Pawn Repay & Collateral Unlock
  const handleRepayPawnOffer = async (offer: P2POffer) => {
    if (!session) return;

    const totalDue = parseFloat((offer.requestedAmount + offer.interestOffered).toFixed(2));
    const solMatch = offer.collateralName.match(/([0-9]*\.?[0-9]+)\s*SOL/i);
    const skrMatch = offer.collateralName.match(/([0-9]*\.?[0-9]+)\s*SKR/i);
    const returnSol = solMatch ? parseFloat(solMatch[1]) : 0;
    const returnSkr = skrMatch ? parseFloat(skrMatch[1]) : 0;

    try {
      const tx = await buildRepayPawnOfferTx(session.publicKey, offer);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Update offer status to 'Repaid'
      offersRef.current = offersRef.current.map((o) =>
        o.id === offer.id ? { ...o, status: 'Repaid' as OfferStatus, solscanUrl, txSignature: sig } : o
      );
      setOffers([...offersRef.current]);

      // Refresh wallet assets from the chain — RPC is the source of truth.
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      const freshProfile = await fetchLiveUserProfile(session.publicKey, session.skrHandle, selectedNetwork);
      setUserProfile(freshProfile);

      setTransactionNotice({
        type: 'repay',
        title: 'Pawn Repaid & Collateral Unlocked!',
        subtitle: `Repaid $${totalDue} USDC. Your ${offer.collateralName} has been unlocked from the Escrow PDA and returned to your wallet.`,
        amount: `$${totalDue} USDC`,
        collateral: offer.collateralName,
        txSignature: sig,
        escrowAddress: offer.escrowAddress,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Repayment Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      setTransactionNotice({
        type: 'error',
        title: 'Repayment Notice',
        subtitle: err?.message || 'Failed to complete pawn repayment.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Cancel P2P Pawn and withdraw collateral
  const handleCancelPawnOffer = async (offer: P2POffer) => {
    if (!session) return;

    const solMatch = offer.collateralName.match(/([0-9]*\.?[0-9]+)\s*SOL/i);
    const skrMatch = offer.collateralName.match(/([0-9]*\.?[0-9]+)\s*SKR/i);
    const returnSol = solMatch ? parseFloat(solMatch[1]) : (skrMatch ? 0 : 0.005);
    const returnSkr = skrMatch ? parseFloat(skrMatch[1]) : 0;

    try {
      const tx = await buildCancelPawnOfferTx(session.publicKey, offer);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Remove offer from active list
      offersRef.current = offersRef.current.filter((o) => o.id !== offer.id);
      setOffers([...offersRef.current]);

      // Refresh wallet assets from the chain — RPC is the source of truth.
      await refreshWalletAssets(session.publicKey, selectedNetwork);

      setTransactionNotice({
        type: 'success',
        title: 'Pawn Cancelled',
        subtitle: `Your ${offer.collateralName} has been unlocked from escrow back to your wallet.`,
        amount: `${returnSol} SOL`,
        collateral: offer.collateralName,
        txSignature: sig,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        return;
      }
      setTransactionNotice({
        type: 'error',
        title: 'Cancel Notice',
        subtitle: err?.message || 'Failed to cancel pawn offer.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Execute real on-chain InitializePool transaction for Individual / Circle
  const handleCreatePool = async (
    name: string,
    poolType: 'Individual' | 'Circle',
    aprPercent: number,
    maxLtvPercent: number,
    minDays: number,
    maxDays: number,
    initialLiquidity: number
  ) => {
    if (!session) return;

    const userUsdc = walletAssets?.usdcBalance ?? 0;
    if (initialLiquidity > userUsdc) {
      Alert.alert(
        'Insufficient USDC Balance',
        `Your wallet has ${userUsdc.toFixed(2)} USDC, but you entered ${initialLiquidity.toFixed(2)} USDC for initial desk liquidity.\n\nPlease deposit or swap for more USDC before initializing a desk.`
      );
      return;
    }

    const poolId = Math.floor(100 + Math.random() * 900);
    const interestRateBps = Math.round(aprPercent * 100);
    const maxLtvBps = Math.round(maxLtvPercent * 100);

    try {
      const { tx, poolPDA } = await buildCreatePoolTx(
        session.publicKey,
        poolId,
        poolType,
        name,
        interestRateBps,
        maxLtvBps,
        minDays,
        maxDays,
        initialLiquidity
      );

      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('Lending pool created on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // The chain is the source of truth: re-fetch pools and assets instead of
      // assembling a local LendingPool with fabricated stake/success fields.
      setPools(await fetchLivePools(selectedNetwork, { force: true }));
      await refreshWalletAssets(session.publicKey, selectedNetwork);

      const isFunded = initialLiquidity > 0;
      setTransactionNotice({
        type: 'borrow',
        title: isFunded ? 'Lending Desk Created & Funded!' : 'Lending Desk Initialized!',
        subtitle: isFunded
          ? `"${name}" (${poolType}) is now live on Solana with $${initialLiquidity.toFixed(2)} USDC available liquidity.`
          : `"${name}" (${poolType}) is now live on Solana. Fund it from the Markets screen when you're ready.`,
        amount: `${aprPercent.toFixed(1)}% per 30d • ${maxLtvPercent.toFixed(0)}% Max LTV`,
        collateral: poolPDA.toBase58().slice(0, 8) + '...',
        txSignature: sig,
        escrowAddress: poolPDA.toBase58(),
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Dismiss',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Initialization Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('InitializePool transaction failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Initialization Notice',
        subtitle: err?.message || 'Could not initialize pool on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Claim SKR yield dividends (tag 17 — 1h stake cooldown applies on-chain)
  const handleClaimYield = async () => {
    if (!session) return;
    try {
      const tx = await buildClaimSkrYieldTx(session.publicKey, USDC_MAINNET_MINT);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('SKR yield claimed on-chain:', sig);
      // Re-read the real on-chain state — the position and vault are the
      // source of truth for accrued/claimed amounts.
      const [vault, position] = await Promise.all([
        fetchSkrYieldVault(selectedNetwork, USDC_MAINNET_MINT, { force: true }),
        fetchUserYieldPosition(selectedNetwork, session.publicKey, USDC_MAINNET_MINT, { force: true }),
      ]);
      setSkrYieldVault(vault);
      setUserYieldPosition(position);
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      showToast('Yield claimed on-chain');
    } catch (err: any) {
      console.warn('Claim yield error:', err);
      const message =
        err?.message?.includes('Custom(38)') ||
        err?.message?.includes('0x26') ||
        err?.message?.includes('cooldown')
          ? 'The 1-hour stake cooldown is still active. Try again later.'
          : err?.message || 'Could not claim yield on-chain.';
      setTransactionNotice({
        type: 'error',
        title: 'Yield Claim Notice',
        subtitle: message,
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Execute real on-chain Stake SKR Reputation Bond transaction
  const handleStakeSkr = async (amount: number) => {
    if (!session) return;

    try {
      const { tx, profilePDA, escrowPDA } = await buildStakeSkrTx(session.publicKey, amount);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('SKR staked on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // The chain is the source of truth for staked SKR, tier and score —
      // local tier math would drift from the program's on-chain thresholds.
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      const freshProfile = await fetchLiveUserProfile(session.publicKey, session.skrHandle, selectedNetwork);
      setUserProfile(freshProfile);
      Promise.all([
        fetchSkrYieldVault(selectedNetwork, USDC_MAINNET_MINT, { force: true }),
        fetchUserYieldPosition(selectedNetwork, session.publicKey, USDC_MAINNET_MINT, { force: true }),
      ]).then(([v, p]) => {
        if (v) setSkrYieldVault(v);
        if (p) setUserYieldPosition(p);
      }).catch(() => {});

      setTransactionNotice({
        type: 'borrow',
        title: '💎 SKR Reputation Bond Staked!',
        subtitle: `Staked ${amount.toLocaleString()} SKR into Protocol Escrow (${escrowPDA.toBase58().slice(0, 8)}...). On-chain APR discount now ${freshProfile.aprDiscount}% (${freshProfile.availableSkr.toLocaleString()} SKR available).`,
        amount: `${amount.toLocaleString()} SKR`,
        collateral: 'Seeker Reputation Escrow',
        txSignature: sig,
        escrowAddress: escrowPDA.toBase58(),
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Staking Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('Stake SKR failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Staking Notice',
        subtitle: err?.message || 'Could not complete SKR reputation bond on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Deposit liquidity into a desk the user owns (Pool Authority only)
  const handleDepositLiquidity = async (pool: LendingPool, amount: number) => {
    if (!session) return;

    try {
      const tx = await buildDepositLiquidityTx(session.publicKey, pool.id, amount);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('Liquidity deposited on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Refresh pools so the desk's Available capacity reflects the deposit
      fetchLivePools(selectedNetwork).then((livePools) => setPools(livePools)).catch((err) => {
        console.warn('Pool refresh after deposit failed:', err);
      });

      setTransactionNotice({
        type: 'repay',
        title: '💧 Desk Funded!',
        subtitle: `Deposited $${amount.toLocaleString()} USDC into "${pool.name}". Borrowers can now draw against your desk.`,
        amount: `$${amount.toLocaleString()} USDC`,
        collateral: `Pool #${pool.id}`,
        txSignature: sig,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Deposit Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('DepositLiquidity transaction failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Deposit Notice',
        subtitle: err?.message || 'Could not deposit liquidity on-chain. Only the desk owner can fund a desk.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Withdraw liquidity from a desk the user owns (Pool Authority only - Instruction 9)
  const handleWithdrawLiquidity = async (pool: LendingPool, amount: number) => {
    if (!session) return;

    try {
      const tx = await buildWithdrawLiquidityTx(session.publicKey, pool.id, amount);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('Liquidity withdrawn on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Refresh pools so available capacity updates
      fetchLivePools(selectedNetwork)
        .then((livePools) => setPools(livePools))
        .catch((err) => console.warn('Pool refresh after withdraw failed:', err));
      await refreshWalletAssets(session.publicKey, selectedNetwork);

      setTransactionNotice({
        type: 'repay',
        title: '💸 Liquidity Withdrawn!',
        subtitle: `Withdrew $${amount.toLocaleString()} USDC from "${pool.name}" back to your wallet.`,
        amount: `$${amount.toLocaleString()} USDC`,
        collateral: `Pool #${pool.id}`,
        txSignature: sig,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Withdrawal Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('WithdrawLiquidity transaction failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Withdrawal Notice',
        subtitle: err?.message || 'Could not withdraw liquidity on-chain. Only the desk owner can withdraw.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Claim default & liquidate collateral for an active loan (Instruction 8)
  const handleClaimLoanDefault = async (order: LoanOrder) => {
    if (!session) return;

    try {
      const tx = await buildClaimLoanDefaultTx(session.publicKey, order);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('Default claimed on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Mark order as defaulted (retained in History)
      ordersRef.current = ordersRef.current.map((o) =>
        o.id === order.id ? { ...o, status: 'Defaulted', txSignature: sig, solscanUrl, repaidAt: Date.now() } : o
      );
      setOrders(ordersRef.current);
      await setCachedOrders(session.publicKey.toBase58(), ordersRef.current, selectedNetwork);
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      loadProtocolData(session.publicKey, session.skrHandle, selectedNetwork).catch(() => {});

      setTransactionNotice({
        type: 'repay',
        title: 'Collateral Liquidated!',
        subtitle: `Successfully seized ${order.collateralAmount} ${order.collateralName} collateral from defaulted Loan #${order.id}. Borrower's reputation bond slashed.`,
        amount: `${order.collateralAmount} ${order.collateralName}`,
        collateral: `Order #${order.id}`,
        txSignature: sig,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Liquidation Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('ClaimDefault transaction failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Liquidation Notice',
        subtitle: err?.message || 'Could not liquidate collateral on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Claim default on a P2P Pawn (Funder seizes collateral - Instruction 8)
  const handleClaimPawnDefault = async (offer: P2POffer) => {
    if (!session) return;

    try {
      const tx = await buildClaimPawnDefaultTx(session.publicKey, offer);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('P2P Pawn default claimed on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Mark offer as defaulted
      offersRef.current = offersRef.current.map((o) =>
        o.id === offer.id ? { ...o, status: 'Defaulted', txSignature: sig, solscanUrl } : o
      );
      setOffers(offersRef.current);
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      loadProtocolData(session.publicKey, session.skrHandle, selectedNetwork).catch(() => {});

      setTransactionNotice({
        type: 'repay',
        title: 'P2P Collateral Claimed!',
        subtitle: `Successfully claimed ${offer.collateralAmount} ${offer.collateralName} collateral for defaulted Pawn #${offer.id}.`,
        amount: `${offer.collateralAmount} ${offer.collateralName}`,
        collateral: `Pawn #${offer.id}`,
        txSignature: sig,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Claim Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('P2P ClaimDefault failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Claim Notice',
        subtitle: err?.message || 'Could not claim P2P collateral on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // Trigger 24h Social Grace for a P2P Pawn
  const handleTriggerPawnGrace = async (offer: P2POffer) => {
    if (!session) return;

    try {
      const tx = await buildTriggerPawnGraceTx(session.publicKey, offer);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('P2P grace triggered on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Mark offer as InGracePeriod
      offersRef.current = offersRef.current.map((o) =>
        o.id === offer.id
          ? {
              ...o,
              status: 'InGracePeriod',
              gracePeriodExpires: Math.floor(Date.now() / 1000) + 86400,
              txSignature: sig,
              solscanUrl,
            }
          : o
      );
      setOffers(offersRef.current);
      loadProtocolData(session.publicKey, session.skrHandle, selectedNetwork).catch(() => {});

      setTransactionNotice({
        type: 'grace',
        title: '24h Grace Period Opened!',
        subtitle: `Social Grace Period activated for Pawn #${offer.id}. The borrower has 24 hours to repay before collateral becomes claimable.`,
        amount: `$${offer.requestedAmount} USDC`,
        collateral: offer.collateralName,
        txSignature: sig,
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Grace Trigger Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('P2P TriggerGrace failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Grace Notice',
        subtitle: err?.message || 'Could not trigger grace period on-chain.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // NEW-3: Execute real on-chain Unstake SKR transaction (exit path for the bond)
  const handleUnstakeSkr = async (amount: number) => {
    if (!session) return;

    try {
      const { tx, escrowPDA } = await buildUnstakeSkrTx(session.publicKey, amount);
      const sig = await signAndSendSeekerTransaction(tx, session, selectedNetwork);
      console.log('SKR unstaked on-chain:', sig);
      const solscanUrl = `https://solscan.io/tx/${sig}`;

      // Refresh wallet assets from the chain — RPC is the source of truth.
      await refreshWalletAssets(session.publicKey, selectedNetwork);
      const freshProfile = await fetchLiveUserProfile(session.publicKey, session.skrHandle, selectedNetwork);
      setUserProfile(freshProfile);
      Promise.all([
        fetchSkrYieldVault(selectedNetwork, USDC_MAINNET_MINT, { force: true }),
        fetchUserYieldPosition(selectedNetwork, session.publicKey, USDC_MAINNET_MINT, { force: true }),
      ]).then(([v, p]) => {
        if (v) setSkrYieldVault(v);
        if (p) setUserYieldPosition(p);
      }).catch(() => {});

      setTransactionNotice({
        type: 'repay',
        title: '↩️ SKR Unstaked!',
        subtitle: `${amount.toLocaleString()} SKR returned to your wallet from the reputation escrow (${escrowPDA.toBase58().slice(0, 8)}...).`,
        amount: `${amount.toLocaleString()} SKR`,
        txSignature: sig,
        escrowAddress: escrowPDA.toBase58(),
        solscanUrl,
        primaryBtnText: 'View on Solscan ↗',
        secondaryBtnText: 'Done',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cancellation') || err?.name?.includes('Cancellation')) {
        setTransactionNotice({
          type: 'error',
          title: 'Unstake Cancelled',
          subtitle: 'Transaction was cancelled in your wallet.',
          primaryBtnText: 'Dismiss',
        });
        return;
      }
      console.warn('Unstake SKR failed:', err);
      setTransactionNotice({
        type: 'error',
        title: 'Unstake Notice',
        subtitle: err?.message || 'Could not unstake SKR on-chain. Note: SKR locked by active loans cannot be unstaked.',
        primaryBtnText: 'Dismiss',
      });
    }
  };

  // 0. Hardware & Environment Integrity Lockdown (Anti-Emulator, Anti-Root, Anti-Frida)
  if (integrity && !integrity.isSecure) {
    return (
      <SecurityLockdownView
        integrity={integrity}
        onRetry={() => checkDeviceIntegrity().then((res) => setIntegrity(res))}
      />
    );
  }

  // 1. Splash Screen
  if (showSplash) {
    return <SplashScreenView onFinish={() => setShowSplash(false)} />;
  }

  // Mandatory App Version Gate (Solana Seeker dApp Store)
  if (versionGateResult?.isMandatory) {
    return <ForceUpdateModal visible={true} versionInfo={versionGateResult} />;
  }

  // 2. Security Lock Screen (Biometrics & Custom PIN)
  if (isLocked) {
    return (
      <SecurityLockScreen
        mode={lockScreenMode}
        userName={session?.skrHandle ?? 'Seeker'}
        onUnlock={() => {
          lastUnlockAtRef.current = Date.now();
          setIsLocked(false);
        }}
        // H-2 (comprehensive audit): the lock must not be one tap away from
        // dismissed. The cancel affordance exists only for opt-in setup
        // flows, never for the unlock challenge itself.
        onCancel={
          lockScreenMode === 'setup' || lockScreenMode === 'change_pin'
            ? () => setIsLocked(false)
            : undefined
        }
      />
    );
  }

  // 3. If no wallet connected, show the Seeker Onboarding Gate
  if (!session) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: statusBarInset }]}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
        />
        <ConnectWalletView
          onConnected={async (newSession) => {
            setSession(newSession);
            await saveSeekerSession(newSession);
            showToast(`Connected: @${newSession.skrHandle}`);
          }}
        />
        {toastMessage && (
          <View
            style={[styles.toastContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            pointerEvents="none"
          >
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.toastText, { color: colors.text }]}>{toastMessage}</Text>
          </View>
        )}
      </View>
    );
  }

  const activeCount = orders.filter((o) => o.status.toUpperCase().includes('ACTIVE') || o.status.toUpperCase().includes('GRACE')).length;

  // "A protocol read is in flight right now." A slice's own 'loading' status is
  // included so the very first frame (before the mount effect fires) reads as
  // loading rather than as a verified-empty list.
  const isProtocolLoading =
    isLoadingPools ||
    ordersStatus === 'loading' ||
    poolsStatus === 'loading' ||
    offersStatus === 'loading';

  const currentProfile: UserProfile = userProfile
    ? {
        ...userProfile,
        reputationScore: userProfile.reputationScore + questBonusBps,
      }
    : {
        pubkey: session.publicKey.toBase58(),
        stakedSkr: 0,
        lockedSkr: 0,
        availableSkr: 0,
        totalLoansCompleted: 0,
        totalLoansDefaulted: 0,
        reputationScore: questBonusBps,
        tier: 'Standard',
        aprDiscount: 0,
      };

  const handleSwitchAddress = async (newPubkey: PublicKey) => {
    const newSkr = await deriveSkrUsername(newPubkey);
    const newSession: SeekerSession = {
      publicKey: newPubkey,
      skrHandle: newSkr,
      isSeekerGenesisVerified: false,
    };
    setSession(newSession);
    await refreshWalletAssets(newPubkey, selectedNetwork);
    await loadProtocolData(newPubkey, newSkr);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: statusBarInset }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
      />

      {/* Main Content Area */}
      <View style={styles.body}>
        {activeTab === 'HOME' && (
          <HomeDashboardView
            skrHandle={session.skrHandle}
            userProfile={currentProfile}
            walletAssets={walletAssets}
            activeOrders={orders.filter((o) => {
              const s = o.status.toUpperCase();
              return s === 'ACTIVE' || s === 'INGRACEPERIOD' || s === 'GRACE_PERIOD';
            })}
            solBalance={solBalance}
            onNavigateBorrow={() => setActiveTab('BORROW')}
            onNavigateRepay={() => setActiveTab('LOANS')}
            onNavigateDesks={() => setActiveTab('MARKET')}
            onOpenAssetsModal={() => setShowAssetsModal(true)}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
            onNavigateHub={() => setActiveTab('HUB')}
            onRefresh={retryProtocolData}
            isLoading={isProtocolLoading}
          />
        )}

        {activeTab === 'BORROW' && (
          <P2PExpressView
            key={`borrow-${borrowPreset ?? 'default'}`}
            initialAmount={borrowPreset ?? undefined}
            pools={pools}
            userProfile={currentProfile}
            walletAssets={walletAssets}
            userPubkey={session?.publicKey?.toBase58()}
            onBorrow={handleBorrow}
            isLoadingPools={isLoadingPools}
            preselectedPool={selectedPool}
            onSelectDesk={setSelectedPool}
            onOpenAssetsModal={() => setShowAssetsModal(true)}
          />
        )}

        {activeTab === 'HUB' && (
          <QuickHubView
            onNavigateBorrow={() => setActiveTab('BORROW')}
            onNavigateDesks={() => setActiveTab('MARKET')}
            onNavigateLoans={() => setActiveTab('LOANS')}
            onNavigateProfile={() => setActiveTab('PROFILE')}
            onOpenAssetsModal={() => setShowAssetsModal(true)}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
            onOpenJudgeBriefing={() => setShowJudgeBriefing(true)}
            onLockApp={() => {
              setLockScreenMode('unlock');
              setIsLocked(true);
            }}
          />
        )}

        {activeTab === 'MARKET' && (
          <MerchantDesksView
            pools={pools}
            offers={offers}
            userPubkey={session.publicKey.toBase58()}
            walletAssets={walletAssets}
            onSelectPool={(pool) => {
              setSelectedPool(pool);
              setActiveTab('BORROW');
            }}
            onFundPawnOffer={handleFundPawnOffer}
            onCreatePawnOffer={handleCreatePawnOffer}
            onRepayPawnOffer={handleRepayPawnOffer}
            onCancelPawnOffer={handleCancelPawnOffer}
            onCreatePool={handleCreatePool}
            onDepositLiquidity={handleDepositLiquidity}
            onWithdrawLiquidity={handleWithdrawLiquidity}
            onClaimPawnDefault={handleClaimPawnDefault}
            onTriggerPawnGrace={handleTriggerPawnGrace}
            isLoading={isLoadingPools || poolsStatus === 'loading'}
            loadFailed={poolsStatus === 'error' || offersStatus === 'error'}
            poolsLoadFailed={poolsStatus === 'error'}
            offersLoadFailed={offersStatus === 'error'}
            onRetry={retryProtocolData}
          />
        )}

        {activeTab === 'LOANS' && (
          <ActiveOrdersView
            orders={orders}
            onRepay={handleRepay}
            onTriggerGrace={handleTriggerGrace}
            onClaimDefault={handleClaimLoanDefault}
            onNavigateBorrow={() => setActiveTab('BORROW')}
            isLoading={ordersStatus === 'loading'}
            loadFailed={ordersStatus === 'error'}
            onRetry={retryProtocolData}
          />
        )}

        {activeTab === 'PROFILE' && (
          <CreditProfileView
            userProfile={currentProfile}
            skrHandle={session.skrHandle}
            walletAssets={walletAssets}
            onStakeSkr={handleStakeSkr}
            onUnstakeSkr={handleUnstakeSkr}
            onOpenAssetsModal={() => setShowAssetsModal(true)}
            onDisconnectWallet={handleDisconnect}
            yieldVault={skrYieldVault}
            yieldPosition={userYieldPosition}
            onClaimYield={handleClaimYield}
            onQuestClaimed={(pts) => {
              setQuestBonusBps(pts * 100);
              showToast(`🎉 +${pts} Points added to your Profile!`);
            }}
            onLockApp={() => {
              setLockScreenMode('unlock');
              setIsLocked(true);
            }}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
            onOpenJudgeBriefing={() => setShowJudgeBriefing(true)}
          />
        )}
      </View>

      {/* Modern 5-Item Bottom Navigation Bar with Center Floating Button (Matches Screenshots) */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.cardBorder,
            paddingBottom: 8 + Math.max(bottomInset, 8),
          },
        ]}
      >
        {/* 1. Home */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('HOME')}
          activeOpacity={0.7}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'HOME' }}
          accessibilityLabel="Home tab"
        >
          <Ionicons
            name={activeTab === 'HOME' ? 'home' : 'home-outline'}
            size={22}
            color={activeTab === 'HOME' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textSecondary },
              activeTab === 'HOME' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>

        {/* 2. Borrow */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            // Direct tab entry means "fresh" borrow: drop any desk picked in
            // the Markets screen and let the screen auto-route again.
            setSelectedPool(null);
            setActiveTab('BORROW');
          }}
          activeOpacity={0.7}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'BORROW' }}
          accessibilityLabel="Borrow tab"
        >
          <Ionicons
            name={activeTab === 'BORROW' ? 'flash' : 'flash-outline'}
            size={22}
            color={activeTab === 'BORROW' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textSecondary },
              activeTab === 'BORROW' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Borrow
          </Text>
        </TouchableOpacity>

        {/* 3. Loans */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('LOANS');
          }}
          activeOpacity={0.7}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'LOANS' }}
          accessibilityLabel="Active Loans tab"
        >
          <View style={{ position: 'relative' }}>
            <Ionicons
              name={activeTab === 'LOANS' ? 'receipt' : 'receipt-outline'}
              size={22}
              color={activeTab === 'LOANS' ? colors.primary : colors.textSecondary}
            />
            {orders.length > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  { backgroundColor: '#EF4444', top: -3, right: -12, minWidth: 16, height: 16, paddingHorizontal: 4 },
                ]}
              >
                <Text style={styles.tabBadgeText} numberOfLines={1}>{orders.length}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textSecondary },
              activeTab === 'LOANS' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Loans
          </Text>
        </TouchableOpacity>

        {/* 4. Desks */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('MARKET')}
          activeOpacity={0.7}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'MARKET' }}
          accessibilityLabel="P2P Desks tab"
        >
          <Ionicons
            name={activeTab === 'MARKET' ? 'storefront' : 'storefront-outline'}
            size={22}
            color={activeTab === 'MARKET' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textSecondary },
              activeTab === 'MARKET' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Desks
          </Text>
        </TouchableOpacity>

        {/* 5. Account / Profile */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('PROFILE')}
          activeOpacity={0.7}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'PROFILE' }}
          accessibilityLabel="Account profile tab"
        >
          <Ionicons
            name={activeTab === 'PROFILE' ? 'person' : 'person-outline'}
            size={22}
            color={activeTab === 'PROFILE' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textSecondary },
              activeTab === 'PROFILE' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Profile
          </Text>
        </TouchableOpacity>
      </View>

      {/* Detailed Wallet Assets & Holdings Modal */}
      <WalletAssetsModal
        visible={showAssetsModal}
        onClose={() => setShowAssetsModal(false)}
        walletAddress={session.publicKey}
        skrHandle={session.skrHandle}
        assets={walletAssets}
        network={selectedNetwork}
        onRefresh={() => refreshWalletAssets(session.publicKey, selectedNetwork)}
        onSwitchAddress={handleSwitchAddress}
        onDisconnect={handleDisconnect}
      />

      {/* Production-Grade Transaction Notice & Notification Modal */}
      <TransactionNoticeModal
        visible={!!transactionNotice}
        data={transactionNotice}
        onClose={() => setTransactionNotice(null)}
      />

      {/* On-Chain Seeker Hall of Fame / Leaderboard Modal */}
      <LeaderboardModal
        visible={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        network={selectedNetwork}
        currentUserPubkey={session?.publicKey}
      />

      {/* Solana Mobile Hackathon Judge Briefing Hub */}
      <JudgeBriefingModal
        visible={showJudgeBriefing}
        onClose={handleJudgeBriefingClose}
      />

      {/* Remote Version Gating Modal (Solana Seeker dApp Store) */}
      <ForceUpdateModal
        visible={!!versionGateResult?.isMandatory}
        versionInfo={versionGateResult}
      />

      {/* Floating In-App Toast Notification */}
      {toastMessage && (
        <View
          style={[styles.toastContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          pointerEvents="none"
        >
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.toastText, { color: colors.text }]}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 22,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'relative',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  centerFabWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  centerFab: {
    position: 'absolute',
    top: -24,
    width: 52,
    height: 52,
    borderRadius: 26,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  centerFabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 4,
    opacity: 0.6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabBadge: {
    position: 'absolute',
    top: -2,
    right: -8,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 84,
    alignSelf: 'center',
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
});
