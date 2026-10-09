import '../polyfill';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import {
  PROGRAM_ID,
  writeU64LE,
  getPoolPDA,
  getVaultPDA,
  getLoanPDA,
  getEscrowPDA,
  getProfilePDA,
  getP2POfferPDA,
  getSkrEscrowPDA,
  getTreasuryPDA,
  getOraclePDA,
  getPoolOraclePDA,
  getAdminPDA,
} from './program';
import {
  PoolType,
  LendingPool,
  LoanOrder,
  P2POffer,
  UserProfile,
  LoanStatus,
  OfferStatus,
  WalletAssets,
  SolanaNetwork,
  TokenAssetItem,
  CreditTier,
} from '../types';

// ── RPC endpoints ───────────────────────────────────────────────────────────
//
// NO API KEY MAY EVER APPEAR IN THIS FILE. `EXPO_PUBLIC_*` variables are inlined
// into the JS bundle at build time, and the bundle ships inside the APK, where
// `strings` — or a Hermes disassembler — will find anything you put in it. A key
// written here is a key you have published.
//
// To use a paid RPC, point these at a proxy you control that injects the key
// server-side. `serverless/src/index.ts` serves exactly that on `/rpc`:
//
//   EXPO_PUBLIC_SOLANA_RPC_URL=https://<your-worker>.workers.dev/rpc
//
// The URL is safe to inline (it is not a secret); the key stays in the Worker's
// secret store. This block deliberately does NOT parse `api-key=` out of a URL
// any more — an earlier version did, so merely setting a keyed URL was enough to
// bake the key into a build without anyone intending it.
const PROXIED_RPC = process.env.EXPO_PUBLIC_SOLANA_RPC_URL;
const PROXIED_RPC_GATEKEEPER = process.env.EXPO_PUBLIC_HELIUS_GATEKEEPER_RPC_URL;

// Defence in depth — NOT the gate. Do not rely on this to stop a key shipping.
//
// This is compiled JS that runs when the module loads, i.e. inside the shipped
// app. Metro inlines `process.env.EXPO_PUBLIC_*` as a string literal at bundle
// time, so by the time this throws the key is ALREADY in the APK and the app
// merely crashes on launch. It cannot prevent the leak it describes.
//
// The real gate is in metro.config.js, which fails the BUNDLE — and therefore
// also covers the Gradle `assembleRelease` -> `export:embed` path, which an npm
// prebuild script would miss. This check stays as a second line of defence for
// values that reach the app by some other route; note it only recognises the
// literal `api-key=` form.
//
// Deliberate escape hatch: a solo project may choose to keep a keyed URL for a
// personal, low-distribution build. Setting EXPO_PUBLIC_CLOCKLEND_ACK_KEYED_RPC=1
// ACKNOWLEDGES that the key ships in the bundle — it exists so the fail-closed
// default is never silently defeated, only consciously waived.
//
// NOTE: metro.config.js honours the same variable. Waiving it here alone is not
// enough — the bundle gate fails the build first, so both must agree.
const KEYED_RPC_ACKNOWLEDGED = process.env.EXPO_PUBLIC_CLOCKLEND_ACK_KEYED_RPC === '1';
if (!KEYED_RPC_ACKNOWLEDGED && PROXIED_RPC && /api-key=/.test(PROXIED_RPC)) {
  throw new Error(
    '[ClockLend] EXPO_PUBLIC_SOLANA_RPC_URL contains an api-key and would be inlined ' +
      'into the shipped bundle. Use a keyless proxy URL instead (see serverless /rpc), or ' +
      'set EXPO_PUBLIC_CLOCKLEND_ACK_KEYED_RPC=1 to consciously waive this check.'
  );
}
if (!KEYED_RPC_ACKNOWLEDGED && PROXIED_RPC_GATEKEEPER && /api-key=/.test(PROXIED_RPC_GATEKEEPER)) {
  throw new Error(
    '[ClockLend] EXPO_PUBLIC_HELIUS_GATEKEEPER_RPC_URL contains an api-key and would be ' +
      'inlined into the shipped bundle. Use a keyless proxy URL instead (see serverless /rpc), or ' +
      'set EXPO_PUBLIC_CLOCKLEND_ACK_KEYED_RPC=1 to consciously waive this check.'
  );
}
if (!KEYED_RPC_ACKNOWLEDGED && process.env.EXPO_PUBLIC_JUPITER_API_KEY) {
  throw new Error(
    '[ClockLend] EXPO_PUBLIC_JUPITER_API_KEY must not be set: it is inlined into the ' +
      'shipped bundle. Move the Jupiter call behind the serverless proxy and keep the key there, or ' +
      'set EXPO_PUBLIC_CLOCKLEND_ACK_KEYED_RPC=1 to consciously waive this check.'
  );
}

const PUBLIC_DEVNET_RPC = 'https://api.devnet.solana.com';
const PUBLIC_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

// Names kept for import compatibility; neither is a Helius endpoint any more.
export const HELIUS_DEVNET_RPC = PROXIED_RPC || PUBLIC_DEVNET_RPC;
export const HELIUS_DEVNET_WSS = PUBLIC_DEVNET_RPC.replace(/^http/, 'ws');
export const HELIUS_MAINNET_WSS = PROXIED_RPC_GATEKEEPER
  ? PROXIED_RPC_GATEKEEPER.replace(/^http/, 'ws')
  : 'wss://api.mainnet-beta.solana.com';

export const DEVNET_RPCS = [PUBLIC_DEVNET_RPC];

export const MAINNET_RPCS = [
  ...(PROXIED_RPC ? [PROXIED_RPC] : []),
  'https://solana-rpc.publicnode.com',
  PUBLIC_MAINNET_RPC,
];

// Base58-encoded 8-byte account discriminators for RPC-side gPA filters.
// Filtering server-side cuts the scan payload from "every account the program
// ever created" to just the requested type — the difference between a screen
// loading in 200ms and in minutes at 1M+ accounts.
const B58_CLK_POOL = 'CFskzA4CnMh';
const B58_CLK_PAWN = 'CFskzA486E1';
const B58_CLK_LOAN = 'CFskz9xGpAZ';
const B58_CLK_PROF = 'CFskzA4DnoP';

// Small TTL cache for protocol reads: screen loads within a few seconds of
// each other (tab switches, re-renders) share one RPC result. Post-mutation
// refreshes pass { force: true } and bypass it.
const FETCH_CACHE_TTL_MS = 10_000;
const fetchCache = new Map<string, { at: number; value: unknown; inflight?: Promise<unknown> }>();
export function cachedFetch<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: { force?: boolean }
): Promise<T> {
  const entry = fetchCache.get(key);
  if (!opts?.force && entry?.inflight) return entry.inflight as Promise<T>;
  if (!opts?.force && entry && Date.now() - entry.at < FETCH_CACHE_TTL_MS) {
    return Promise.resolve(entry.value as T);
  }
  // M-1: the inflight promise must be cleared when it rejects. Otherwise a
  // single transient RPC failure stays cached and every later caller (the
  // `entry?.inflight` short-circuit is checked before the TTL) re-rejects with
  // the same stale error for the whole session.
  const p = fn().then(
    (v) => {
      fetchCache.set(key, { at: Date.now(), value: v });
      return v;
    },
    (err) => {
      fetchCache.delete(key);
      throw err;
    }
  );
  fetchCache.set(key, { at: entry?.at ?? 0, value: entry?.value, inflight: p });
  return p;
}

export const devnetConnection = new Connection(DEVNET_RPCS[0], {
  wsEndpoint: HELIUS_DEVNET_WSS,
  commitment: 'confirmed',
});
export const mainnetConnection = new Connection(MAINNET_RPCS[0], {
  wsEndpoint: HELIUS_MAINNET_WSS,
  commitment: 'confirmed',
});

export function getConnection(network: SolanaNetwork = 'mainnet-beta'): Connection {
  return network === 'mainnet-beta' ? mainnetConnection : devnetConnection;
}

// Default export connection for backwards compatibility
export const connection = mainnetConnection;

export { PROGRAM_ID };

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Seeker Genesis Token mint (Soulbound Token-2022). Single source of truth:
// devnet test mint + mainnet Token-2022 group mint (GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te).
export const SGT_DEVNET_MINT = '4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG';
export const SGT_GROUP_MINT = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
export const SGT_MINT = SGT_DEVNET_MINT;
export function isSeekerGenesisToken(mint: string): boolean {
  return mint === SGT_DEVNET_MINT || mint === SGT_GROUP_MINT;
}
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// M-04: Legacy devnet USDC mint (kept for parsing legacy devnet accounts)
export const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const SKR_MINT = new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
export const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export const SKR_YIELD_VAULT_SEED = Buffer.from('skr_yield_vault');
export const SKR_YIELD_TOKEN_SEED = Buffer.from('skr_yield_token');
export const USER_YIELD_SEED = Buffer.from('skr_yield_user');

// ---------------------------------------------------------------------------
// C-2: SKR-bond APR discount — the program's exact rule (processor.rs:1905-1916)
//
//   available_skr = staked_skr.saturating_sub(locked_skr)
//   available_skr >= 1_000_000_000  -> discount = rate/2        (Tier 2, locks 1,000 SKR)
//   available_skr >=   100_000_000  -> discount = rate*2500/1e4 (Tier 1, locks   100 SKR)
//   otherwise                       -> no discount
//
// There is NO reputation-score tiering on-chain: a wallet with a perfect score
// and no SKR bond pays the pool's full rate. Every client label must show the
// discount these constants produce (or 0%).
// ---------------------------------------------------------------------------
export const SKR_TIER_MIN_THRESHOLD_MICRO = 100_000_000n; // 100 SKR
export const SKR_TIER_MAX_THRESHOLD_MICRO = 10_000_000_000n; // 10,000 SKR
export const SKR_TIER_1_THRESHOLD_MICRO = 100_000_000n; // 100 SKR (1%)
export const SKR_TIER_2_THRESHOLD_MICRO = 10_000_000_000n; // 10,000 SKR (25% MAX)

// The bundled `buffer` typings type readBigUInt64LE as the boxed BigInt
// interface rather than the primitive, so every value that crosses a helper
// boundary is normalized through .toString().
export function toBigInt(value: number | bigint | { toString(): string }): bigint {
  return typeof value === 'bigint' ? value : BigInt(String(value));
}

export function deriveAprDiscountPercent(
  stakedSkrMicro: number | bigint | { toString(): string },
  lockedSkrMicro: number | bigint | { toString(): string }
): number {
  const staked = toBigInt(stakedSkrMicro);
  const locked = toBigInt(lockedSkrMicro);
  const available = staked > locked ? staked - locked : 0n;
  if (available < SKR_TIER_MIN_THRESHOLD_MICRO) return 0;
  if (available >= SKR_TIER_MAX_THRESHOLD_MICRO) return 25;
  const diff = available - SKR_TIER_MIN_THRESHOLD_MICRO;
  const range = SKR_TIER_MAX_THRESHOLD_MICRO - SKR_TIER_MIN_THRESHOLD_MICRO;
  const discountBps = 100n + (diff * 2400n) / range;
  return Number(discountBps) / 100;
}

/** Tier label for the tier the program will actually honour (see CreditTier). */
export function tierFromAprDiscount(aprDiscount: number): CreditTier {
  if (aprDiscount >= 25) return 'Tier 2';
  if (aprDiscount >= 1) return 'Tier 1';
  return 'Standard';
}

/** Human label pairing a tier with the discount it earns (never a bare claim). */
export function tierDiscountLabel(tier: CreditTier, aprDiscount?: number): string {
  if (aprDiscount !== undefined && aprDiscount > 0) {
    return `${aprDiscount.toFixed(1)}% APR discount`;
  }
  if (tier === 'Tier 2') return 'VIP Tier · 25% APR discount';
  if (tier === 'Tier 1') return 'Active Tier · 1% to 25% APR discount';
  return 'No SKR bond · 0% APR discount';
}

/**
 * The bond the program locks while the loan is active (processor.rs:1990-2005).
 *
 * The bond is FIXED per discount band — it is not a percentage of the stake and
 * not a percentage of the loan (see `bond_for_discount_bps` in processor.rs for
 * why). A band the borrower cannot fully cover locks only what they have, so
 * this returns `min(available, band)`.
 */
export function bondLockedForSkrMicro(
  availableSkrMicro: number | bigint | { toString(): string }
): bigint {
  const available = toBigInt(availableSkrMicro);
  if (available < SKR_TIER_MIN_THRESHOLD_MICRO) return 0n;
  const discount = deriveAprDiscountPercent(available, 0n);
  const discountBps = Math.round(discount * 100);
  const required =
    discountBps <= 500 ? 100_000_000n
    : discountBps <= 1000 ? 250_000_000n
    : discountBps <= 1800 ? 500_000_000n
    : 1_000_000_000n;
  return available < required ? available : required;
}

/** Mirrors the program's integer discount math bit-for-bit. */
export function applyAprDiscountBps(baseRateBps: number, aprDiscountPercent: number): number {
  if (aprDiscountPercent <= 0) return baseRateBps;
  const discountBps = Math.min(2500, Math.round(aprDiscountPercent * 100));
  const discount = Math.floor((baseRateBps * discountBps) / 10000);
  return Math.max(0, baseRateBps - discount);
}

// M-03: Integer Interest Calculation Helper matching Smart Contract exactly
// (processor.rs:2016-2023: amount * effective_bps * duration / (10000 * INTEREST_PERIOD_SECS)).
//
// LOAD-BEARING: the denominator is a 30-DAY period, not a year. Interest is a
// percentage of the principal per 30-day term, prorated linearly for shorter
// terms — so a full 30-day loan costs exactly `rateBps`. Using 365 days here
// would quote the user ~12x less interest than the chain actually charges.
export const INTEREST_PERIOD_SECS = 2_592_000; // 30 days

export function calculateExactInterestDue(
  borrowAmountMicro: bigint,
  rateBps: number,
  durationSeconds: number,
  aprDiscountPercent: number = 0
): bigint {
  const effectiveBps = applyAprDiscountBps(rateBps, aprDiscountPercent);
  const numerator = borrowAmountMicro * BigInt(effectiveBps) * BigInt(durationSeconds);
  const denominator = BigInt(10000) * BigInt(INTEREST_PERIOD_SECS);
  return numerator / denominator;
}

/** The program's rate ceiling, in bps, per `INTEREST_PERIOD_SECS` (processor.rs). */
export const MAX_INTEREST_RATE_BPS = 1000;

/**
 * The most interest a P2P pawn is allowed to offer (processor.rs
 * `process_create_p2p_offer`). Same ceiling as a pool rate — 10% of the amount
 * borrowed per 30-day term, prorated — so a 1-day pawn cannot charge what a
 * 30-day one does. Floored by integer division, exactly as the program floors
 * it, so this check can never pass something the chain would reject.
 */
export function maxP2PInterestOffered(
  requestedAmountMicro: bigint,
  durationSeconds: number
): bigint {
  const numerator =
    requestedAmountMicro * BigInt(MAX_INTEREST_RATE_BPS) * BigInt(durationSeconds);
  return numerator / (BigInt(10000) * BigInt(INTEREST_PERIOD_SECS));
}

// H-3: origination fee withheld from the disbursement (processor.rs:1742-1745):
//   25 bps of the gross for native-SOL collateral, 50 bps for SKR collateral,
//   floored in u128. The borrower receives the NET amount.
export function originationFeeBps(isNativeSolCollateral: boolean): number {
  return isNativeSolCollateral ? 25 : 50;
}

export function calculateOriginationFee(
  borrowAmountMicro: bigint,
  isNativeSolCollateral: boolean
): { feeBps: number; feeMicro: bigint; netMicro: bigint } {
  const feeBps = originationFeeBps(isNativeSolCollateral);
  const feeMicro = (borrowAmountMicro * BigInt(feeBps)) / 10000n;
  return { feeBps, feeMicro, netMicro: borrowAmountMicro - feeMicro };
}

/**
 * Render an exact USDC base-unit amount. USDC has 6 decimals, so sub-cent
 * values (e.g. a 0.25% fee on $50 = $0.125) are real — they are printed as
 * they are instead of being rounded into an amount that no longer matches the
 * program's arithmetic.
 */
export function formatUsdcMicro(micro: bigint | number): string {
  const value = typeof micro === 'bigint' ? micro : BigInt(Math.round(micro));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  const body = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/**
 * L-7: single collateral-type test for every call site. Matches the bare
 * symbol ("SOL") and quantity-prefixed labels ("1.500 SOL") while refusing
 * lookalike assets such as "JitoSOL" that the old `includes('SOL')` accepted.
 */
export function isNativeSolCollateralName(collateralName: string): boolean {
  return /(^|\s)SOL$/.test((collateralName || '').trim().toUpperCase());
}

/**
 * M-6: deterministic loan id. The program only requires the id to be unused
 * for (pool, borrower) — it is stored in the loan account, so the client can
 * always read it back. Deriving it instead of using Math.random() means a
 * SecureStore-cache loss cannot orphan a freshly created loan: the same
 * (pool.loansOriginated, second) pair reproduces the id, and the on-chain
 * scan recovers it regardless.
 */
export function deriveLoanId(poolLoansOriginated: number, nowMs: number = Date.now()): number {
  const suffix = Math.floor(nowMs / 1000) % 100_000;
  const originated = Math.max(0, Math.floor(poolLoansOriginated || 0)) % 100_000;
  // 0 is a valid loan id on-chain but a poor sentinel client-side.
  return originated * 100_000 + suffix + 1;
}

export function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

/** Associated Token Program createIdempotent (tag 1) — no spl-token dep. */
export function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

// Seeded pool addresses for instantaneous retrieval (populated after mainnet desk creation)
const SEEDED_POOLS: PublicKey[] = [
  new PublicKey('DqjjKqmntorNQYa9dJ6forBxZFPup5TmZ2ZpMBy4EZpF'), // ClockLend Genesis USDC Desk
];

export const GENESIS_MAINNET_POOL: LendingPool = {
  id: 2,
  poolType: 'Circle',
  authority: '8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds',
  name: 'ClockLend Genesis USDC Desk',
  liquidityMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  totalLiquidity: 50,
  totalBorrowed: 0,
  stakedSkrAmount: 0,
  interestRateBps: 800,
  maxLtvBps: 6500,
  minDurationDays: 3,
  maxDurationDays: 30,
  loansOriginated: 0,
  loansRepaid: 0,
  successRate: null,
  poolPubkey: 'DqjjKqmntorNQYa9dJ6forBxZFPup5TmZ2ZpMBy4EZpF',
  isVerifiedMerchant: true,
  hasCustomOracle: false,
};

/**
 * True when an error indicts the *endpoint* rather than the request.
 *
 * A 429 says "not now"; a transaction that the cluster rejected says something
 * about the transaction, and re-asking a different node will only produce the
 * same answer more slowly. Callers that may see both pass this as
 * `shouldFallback`.
 */
export function isEndpointFailure(err: any): boolean {
  const msg = String(err?.message ?? err ?? '');
  return /429|too many requests|max usage|rate ?limit|throttl|timed? ?out|timeout|fetch failed|network request failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|50[234]/i.test(
    msg
  );
}

// Helper to query with automatic fallback to secondary RPC endpoints
export async function queryRpcWithFallback<T>(
  network: SolanaNetwork,
  queryFn: (conn: Connection) => Promise<T>,
  opts?: { shouldFallback?: (err: any) => boolean }
): Promise<T> {
  const rpcList = network === 'mainnet-beta' ? MAINNET_RPCS : DEVNET_RPCS;
  let lastError: any = null;

  for (const rpc of rpcList) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      return await queryFn(conn);
    } catch (err: any) {
      lastError = err;
      // A caller that knows some failures are about the request, not the
      // endpoint, stops here and surfaces the real reason instead of retrying
      // the same doomed call on every remaining node.
      if (opts?.shouldFallback && !opts.shouldFallback(err)) throw err;
      console.warn(`[RPC Fallback] ${rpc} notice:`, err?.message || err);
    }
  }

  throw lastError || new Error(`All RPC endpoints failed for ${network}`);
}

// Local hybrid cache for persistent loan orders (strictly namespaced by network)
export async function getCachedOrders(
  borrowerPubkey: string,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<LoanOrder[]> {
  try {
    const raw = await SecureStore.getItemAsync(`clocklend_orders_${network}_${borrowerPubkey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error reading cached orders:', err);
  }
  return [];
}

export async function setCachedOrders(
  borrowerPubkey: string,
  orders: LoanOrder[],
  network: SolanaNetwork = 'mainnet-beta'
): Promise<void> {
  try {
    await SecureStore.setItemAsync(`clocklend_orders_${network}_${borrowerPubkey}`, JSON.stringify(orders));
  } catch (err) {
    console.warn('Error saving cached orders:', err);
  }
}

// Helper to decode null-terminated on-chain string from 32-byte array
function decodeName(bytes: Uint8Array): string {
  let end = bytes.indexOf(0);
  if (end === -1) end = bytes.length;
  const decoded = new TextDecoder().decode(bytes.slice(0, end)).trim();
  return decoded.length > 0 ? decoded : 'Community Pool';
}

function parsePoolData(pubkey: string, rawData: Buffer | Uint8Array, id: number): LendingPool | null {
  const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
  if (data.length !== 200 && data.length !== 182) return null;
  const isV2 = data.length === 200;
  // NEW-4: discriminator-gated parsing — never parse a non-pool account as a pool
  // Check bytes directly: 'CLK_POOL' = [67, 76, 75, 95, 80, 79, 79, 76]
  const isClkPool =
    data[0] === 67 &&
    data[1] === 76 &&
    data[2] === 75 &&
    data[3] === 95 &&
    data[4] === 80 &&
    data[5] === 79 &&
    data[6] === 79 &&
    data[7] === 76;
  if (isV2 && !isClkPool) return null;
  const offset = isV2 ? 8 : 0;
  const isInitialized = data.readUInt8(offset) === 1;
  if (!isInitialized) return null;

  const poolId = isV2 ? Number(data.readBigUInt64LE(9)) : id;
  const poolTypeByte = data.readUInt8(isV2 ? 17 : 1);
  const poolType: PoolType = poolTypeByte === 2 ? 'Institutional' : poolTypeByte === 1 ? 'Circle' : 'Individual';
  const authority = new PublicKey(data.subarray(isV2 ? 18 : 2, isV2 ? 50 : 34)).toBase58();
  const liquidityMint = new PublicKey(data.subarray(isV2 ? 50 : 34, isV2 ? 82 : 66)).toBase58();
  const totalLiquidity = Number(data.readBigUInt64LE(isV2 ? 114 : 98));
  const totalBorrowed = Number(data.readBigUInt64LE(isV2 ? 122 : 106));
  const stakedSkrAmount = Number(data.readBigUInt64LE(isV2 ? 130 : 114));
  const interestRateBps = data.readUInt16LE(isV2 ? 138 : 122);
  const maxLtvBps = data.readUInt16LE(isV2 ? 140 : 124);
  const minDurationDays = Math.round(Number(data.readBigInt64LE(isV2 ? 142 : 126)) / 86400);
  const maxDurationDays = Math.round(Number(data.readBigInt64LE(isV2 ? 150 : 134)) / 86400);
  const loansOriginated = data.readUInt32LE(isV2 ? 158 : 142);
  const loansRepaid = data.readUInt32LE(isV2 ? 162 : 146);
  const name = decodeName(data.subarray(isV2 ? 166 : 150, isV2 ? 198 : 182));

  // Explicitly exclude legacy / test pools requested to be removed
  const cleanName = name.trim().toLowerCase();
  if (
    cleanName.includes('seeker genesis') ||
    cleanName.includes('chad') ||
    poolId === 1 ||
    poolId === 958 ||
    pubkey === '4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu'
  ) {
    return null;
  }

  // state.rs LendingPool is 200 bytes with has_custom_oracle as the trailing
  // byte (offset 199); the 182-byte legacy layout predates the flag.
  const hasCustomOracle = isV2 ? data.readUInt8(199) === 1 : false;

  // null (rendered as '—') until the desk actually has loan history.
  const successRate: number | null = loansOriginated > 0 ? (loansRepaid / loansOriginated) * 100 : null;

  return {
    id: poolId,
    poolType,
    authority,
    name,
    liquidityMint,
    totalLiquidity: totalLiquidity / 1_000_000,
    totalBorrowed: totalBorrowed / 1_000_000,
    stakedSkrAmount,
    interestRateBps,
    maxLtvBps,
    minDurationDays: minDurationDays || 1,
    maxDurationDays: maxDurationDays || 30,
    loansOriginated,
    loansRepaid,
    successRate: successRate === null ? null : parseFloat(successRate.toFixed(1)),
    poolPubkey: pubkey,
    isVerifiedMerchant: stakedSkrAmount > 0 || pubkey === 'DqjjKqmntorNQYa9dJ6forBxZFPup5TmZ2ZpMBy4EZpF',
    hasCustomOracle,
  };
}

// Fetch all live Lending Pools from the deployed contract
export async function fetchLivePools(
  network: SolanaNetwork = 'mainnet-beta',
  opts?: { force?: boolean }
): Promise<LendingPool[]> {
  return cachedFetch(`pools:${network}`, () => fetchLivePoolsUncached(network), opts);
}

async function fetchLivePoolsUncached(network: SolanaNetwork): Promise<LendingPool[]> {
  const poolsMap = new Map<string, LendingPool>();
  const rpcConn = getConnection(network);

  // 1. Fast path: load known seeded pools via getMultipleAccountsInfo (~300ms)
  try {
    const accounts = await queryRpcWithFallback(network, (c) => c.getMultipleAccountsInfo(SEEDED_POOLS));
    accounts.forEach((acc, idx) => {
      if (acc && acc.data) {
        const pool = parsePoolData(SEEDED_POOLS[idx].toBase58(), Buffer.from(acc.data), poolsMap.size + 1);
        if (pool) poolsMap.set(SEEDED_POOLS[idx].toBase58(), pool);
      }
    });
  } catch (err) {
    console.warn('Fast pool query notice:', err);
  }

  // 2. Filtered scan for additional pools: RPC-side discriminator filter for
  // modern 200-byte pools + a legacy 182-byte dataSize query. This fetches
  // only pool accounts instead of the program's entire account history.
  try {
    const accounts = await queryRpcWithFallback(network, async (c) => {
      const [modern, legacy] = await Promise.all([
        c.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: B58_CLK_POOL } }] }),
        // web3.js 1.99's config type lacks the dataSize filter variant even
        // though the RPC supports it — cast the (runtime-correct) result.
        (c.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 182 }] } as any) as unknown) as Promise<
          Awaited<ReturnType<Connection['getProgramAccounts']>>
        >,
      ]);
      return [...modern, ...legacy];
    });
    for (const acc of accounts) {
      if (acc.account.data.length === 200 || acc.account.data.length === 182) {
        const pubkeyStr = acc.pubkey.toBase58();
        if (!poolsMap.has(pubkeyStr)) {
          const pool = parsePoolData(pubkeyStr, Buffer.from(acc.account.data), poolsMap.size + 1);
          if (pool) poolsMap.set(pubkeyStr, pool);
        }
      }
    }
  } catch (err) {
    console.warn('Full pool scan notice:', err);
  }

  // Fallback guarantee: if mainnet scan returned 0 pools, preserve the verified Genesis desk
  if (network === 'mainnet-beta' && poolsMap.size === 0) {
    poolsMap.set(GENESIS_MAINNET_POOL.poolPubkey!, GENESIS_MAINNET_POOL);
  }

  return Array.from(poolsMap.values()).filter((p) => {
    const n = (p.name || '').trim().toLowerCase();
    return (
      !n.includes('seeker genesis') &&
      !n.includes('chad') &&
      p.id !== 1 &&
      p.id !== 958 &&
      p.poolPubkey !== '4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu'
    );
  });
}

// Fetch live user loan orders directly from the contract & on-chain state
export async function fetchLiveUserOrders(
  borrower: PublicKey,
  network: SolanaNetwork = 'mainnet-beta',
  userPools?: LendingPool[]
): Promise<LoanOrder[]> {
  const rpcConn = getConnection(network);
  const borrowerPubkey = borrower.toBase58();
  const cachedOrders = await getCachedOrders(borrowerPubkey, network);
  const cachedBySig = new Map<string, LoanOrder>();
  const cachedById = new Map<number, LoanOrder>();
  const ordersMap = new Map<number, LoanOrder>();

  for (const co of cachedOrders) {
    if (co.txSignature) cachedBySig.set(co.txSignature, co);
    cachedById.set(co.id, co);
    // Keep past history loaded
    if (co.status === 'Repaid' || co.status === 'Defaulted') {
      ordersMap.set(co.id, co);
    }
  }

  // Known pool map for resolving pool names and checking desk-ownership
  const poolByPubkey = new Map<string, LendingPool>();
  if (userPools) {
    for (const p of userPools) {
      const [pda] = getPoolPDA(new PublicKey(p.authority), p.id);
      poolByPubkey.set(pda.toBase58(), p);
    }
  }

  // 1. Scan on-chain PDA accounts first (for liquid pool PDA loans).
  // L-3: only CLK_LOAN accounts are parsed now.
  let chainReadSucceeded = false;
  try {
    const accounts = await queryRpcWithFallback(network, (c) =>
      c.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: B58_CLK_LOAN } }] })
    );
    chainReadSucceeded = true;
    for (const acc of accounts) {
      if (acc.account.data.length === 170) {
        const data = Buffer.from(acc.account.data);
        // NEW-4: discriminator-gated parsing — never parse a non-loan account as a loan
        if (readDiscriminator(data) !== 'CLK_LOAN') continue;
        const isActive = data.readUInt8(8) === 1;

        const borrowerOnChain = new PublicKey(data.subarray(17, 49));
        const poolPubkey = new PublicKey(data.subarray(49, 81));
        const poolPubkeyStr = poolPubkey.toBase58();
        const matchedPool = poolByPubkey.get(poolPubkeyStr);

        const isBorrower = borrowerOnChain.equals(borrower);
        const isLender = Boolean(
          matchedPool && matchedPool.authority.toLowerCase() === borrowerPubkey.toLowerCase()
        );

        // Include loans where user is either the borrower or the pool authority (lender)
        if (!isBorrower && !isLender) continue;

        const loanId = Number(data.readBigUInt64LE(9));
        const principalAmount = Number(data.readBigUInt64LE(81)) / 1_000_000;
        const collateralMint = new PublicKey(data.subarray(89, 121)).toBase58();
        const rawCollateral = Number(data.readBigUInt64LE(121));

        // M-4: decimals come from the actual mint, never a blanket 1e9.
        const isSolMint =
          collateralMint === NATIVE_SOL_MINT.toBase58() ||
          collateralMint === SystemProgram.programId.toBase58();
        const isSkrMint = collateralMint === SKR_MINT.toBase58();
        if (!isSolMint && !isSkrMint) {
          console.warn(`[Orders] loan #${loanId} has unsupported collateral mint ${collateralMint} — skipped`);
          continue;
        }
        const collateralAmount = isSkrMint ? rawCollateral / 1_000_000 : rawCollateral / 1_000_000_000;
        const collateralName = isSkrMint
          ? `${collateralAmount.toLocaleString()} SKR`
          : `${collateralAmount.toFixed(2)} SOL`;
        const interestDue = Number(data.readBigUInt64LE(129)) / 1_000_000;
        const originationTime = Number(data.readBigInt64LE(137));
        const dueTime = Number(data.readBigInt64LE(145));
        const gracePeriodExpires = Number(data.readBigInt64LE(153));
        const statusByte = data.readUInt8(161);

        let status: LoanStatus = 'Active';
        if (statusByte === 1) status = 'InGracePeriod';
        else if (statusByte === 2 || !isActive) status = 'Repaid';
        else if (statusByte === 3) status = 'Defaulted';

        const [loanPDA] = getLoanPDA(poolPubkey, borrowerOnChain, loanId);
        const [escrowPDA] = getEscrowPDA(loanPDA);

        const cachedRec = cachedById.get(loanId);
        const txSig = cachedRec?.txSignature;
        const solscan = txSig ? `https://solscan.io/tx/${txSig}` : cachedRec?.solscanUrl;

        const id = loanId;
        ordersMap.set(id, {
          id,
          poolId: matchedPool ? matchedPool.id : 2,
          poolName: matchedPool ? matchedPool.name : 'ClockLend Genesis USDC Desk',
          poolPubkey: poolPubkeyStr,
          borrower: borrowerOnChain.toBase58(),
          principalAmount,
          collateralName,
          collateralMint,
          collateralAmount,
          interestDue,
          originationTime,
          dueTime,
          gracePeriodExpires,
          status,
          txSignature: txSig,
          escrowAddress: escrowPDA.toBase58(),
          solscanUrl: solscan,
          isLender,
          lender: matchedPool?.authority,
        });
      }
    }
  } catch (err) {
    console.warn('Program account query notice:', err);
  }

  const finalizeOrders = async (): Promise<LoanOrder[]> => {
    let usedCache = false;
    // Fallback if chain read failed
    if (!chainReadSucceeded && ordersMap.size === 0 && cachedOrders.length > 0) {
      for (const co of cachedOrders) {
        if (co.status === 'Active' || co.status === 'InGracePeriod') {
          ordersMap.set(co.id, { ...co, isStale: true });
          usedCache = true;
        }
      }
    }
    // Always preserve settled history records from cache
    for (const co of cachedOrders) {
      if ((co.status === 'Repaid' || co.status === 'Defaulted') && !ordersMap.has(co.id)) {
        ordersMap.set(co.id, co);
      }
    }
    const finalOrders = Array.from(ordersMap.values());
    if (!usedCache) {
      await setCachedOrders(borrowerPubkey, finalOrders, network);
    }
    return finalOrders;
  };

  // 2. Scan blockchain transactions & memos for ground-truth borrow/repay history.
  // Every on-chain loan is a PDA account (found by the filtered scan above), so
  // this heavy signature walk only runs as a LAST-RESORT fallback when the PDA
  // scan found nothing — and with a bounded window. It no longer duplicates the
  // PDA results (memo candidates must resolve to a real loan PDA anyway).
  if (ordersMap.size > 0) {
    return finalizeOrders();
  }
  try {
    const signatures = await queryRpcWithFallback(network, (c) => c.getSignaturesForAddress(borrower, { limit: 20 }));
    const memos = signatures
      .filter((s) => Boolean(s.memo))
      .map((s) => ({
        time: s.blockTime || Math.floor(Date.now() / 1000),
        memo: s.memo!.replace(/^\[\d+\]\s*/, '').trim(),
        sig: s.signature,
      }));

    // Sort chronologically from oldest to newest to pair repayments with borrows accurately
    memos.sort((a, b) => a.time - b.time);

    interface OpenBorrowCandidate {
      id: number;
      principal: number;
      collateral: string;
      poolId: number;
      time: number;
      sig: string;
    }
    const openCandidates: OpenBorrowCandidate[] = [];

    for (const m of memos) {
      // Check for borrow memo with explicit Order/Loan ID
      const borrowWithId = m.memo.match(
        /ClockLend:\s*Borrow\s*#?(\d+)\s*\$?([\d.]+)\s*USDC.*?Collateral:\s*([^\s|]+(?:\s+[^\s|]+)?)\s*(?:locked)?.*?Pool\s*#(\d+)/i
      );
      // Check for borrow memo without explicit ID (legacy format)
      const borrowLegacy = !borrowWithId
        ? m.memo.match(
            /ClockLend:\s*Borrow\s*\$?([\d.]+)\s*USDC.*?Collateral:\s*([^\s|]+(?:\s+[^\s|]+)?)\s*(?:locked)?.*?Pool\s*#(\d+)/i
          )
        : null;

      if (borrowWithId || borrowLegacy) {
        let orderId = 0;
        let principal = 0;
        let collateral = '';
        let poolId = 1;

        if (borrowWithId) {
          orderId = parseInt(borrowWithId[1]);
          principal = parseFloat(borrowWithId[2]);
          collateral = borrowWithId[3].trim();
          poolId = parseInt(borrowWithId[4]);
        } else if (borrowLegacy) {
          principal = parseFloat(borrowLegacy[1]);
          collateral = borrowLegacy[2].trim();
          poolId = parseInt(borrowLegacy[3]);

          // Check if already in cache for this signature. A legacy memo with no
          // cached id cannot be resolved to a loan PDA — skip it rather than
          // invent an identifier (the PDA derivation would target the wrong loan).
          const cached = cachedBySig.get(m.sig);
          if (!cached) continue;
          orderId = cached.id;
        }

        openCandidates.push({
          id: orderId,
          principal,
          collateral,
          poolId,
          time: m.time,
          sig: m.sig,
        });
        continue;
      }

      // Check for repay memo
      const repayMatch = m.memo.match(/ClockLend:\s*Repay.*?Order\s*#?(\d+)\s*Closed/i);
      if (repayMatch) {
        const closedId = parseInt(repayMatch[1]);
        const exactIdx = openCandidates.findIndex((b) => b.id === closedId);
        if (exactIdx !== -1) {
          openCandidates.splice(exactIdx, 1);
        } else {
          // Pair with the most recent open candidate prior to this repay
          const priorCandidates = openCandidates.filter((b) => b.time <= m.time);
          if (priorCandidates.length > 0) {
            const lastCandidate = priorCandidates[priorCandidates.length - 1];
            const idx = openCandidates.indexOf(lastCandidate);
            if (idx !== -1) openCandidates.splice(idx, 1);
          }
        }
      }
    }

    // Convert open candidates into LoanOrder records — from the CHAIN, never
    // from fabricated identifiers. A memo-derived candidate is only shown when
    // its pool resolves to a real on-chain desk AND its loan PDA exists with
    // the expected borrower; everything else is skipped rather than invented.
    const nowSec = Math.floor(Date.now() / 1000);
    const livePools = await fetchLivePools(network);
    const poolsById = new Map(livePools.map((p) => [p.id, p]));
    for (const cand of openCandidates) {
      // If locally marked repaid, skip
      const cached = cachedById.get(cand.id) || cachedBySig.get(cand.sig);
      if (cached && cached.status === 'Repaid') continue;

      const pool = poolsById.get(cand.poolId);
      if (!pool) {
        console.warn(`[Orders] memo candidate pool #${cand.poolId} has no on-chain desk — skipped`);
        continue;
      }
      const [poolPDA] = getPoolPDA(new PublicKey(pool.authority), pool.id);
      const [loanPDA] = getLoanPDA(poolPDA, borrower, cand.id);
      const [escrowPDA] = getEscrowPDA(loanPDA);

      // The loan PDA is the single source of truth for amounts, terms and status.
      const info = await rpcConn.getAccountInfo(loanPDA);
      const data = info?.data ? Buffer.from(info.data) : undefined;
      if (!data || data.length < 170 || readDiscriminator(data) !== 'CLK_LOAN') {
        console.warn(`[Orders] memo candidate #${cand.id} has no on-chain loan PDA — skipped`);
        continue;
      }
      if (data.readUInt8(8) !== 1) continue; // not active
      const onChainBorrower = new PublicKey(data.subarray(17, 49));
      if (!onChainBorrower.equals(borrower)) continue;

      // LoanOrder layout (170-byte): discriminator[0..8], is_active[8],
      // loan_id[9..17], borrower[17..49], pool[49..81], principal[81..89],
      // collateral_mint[89..121], collateral_amount[121..129],
      // interest_due[129..137], origination[137..145], due[145..153],
      // grace_expires[153..161], status[161], locked_skr[162..170].
      const principalMicro = Number(data.readBigUInt64LE(81));
      const interestMicro = Number(data.readBigUInt64LE(129));
      const dueTime = Number(data.readBigInt64LE(145));
      const gracePeriodExpires = Number(data.readBigInt64LE(153));
      const statusByte = data.readUInt8(161);
      const collateralMint = new PublicKey(data.subarray(89, 121)).toBase58();
      const collateralAmountRaw = Number(data.readBigUInt64LE(121));

      const isSol = collateralMint === NATIVE_SOL_MINT.toBase58() ||
        collateralMint === SystemProgram.programId.toBase58();
      const isSkrMint = collateralMint === SKR_MINT.toBase58();
      // M-4: no decimal guesswork — only the two mints the program accepts.
      if (!isSol && !isSkrMint) {
        console.warn(`[Orders] memo candidate #${cand.id} has unsupported collateral mint ${collateralMint} — skipped`);
        continue;
      }
      const collUnits = isSol ? collateralAmountRaw / 1_000_000_000 : collateralAmountRaw / 1_000_000;
      // The program rejects collateral_amount == 0 at borrow time, so a zero
      // here means corrupt bytes — do not invent a "1.0" placeholder.
      if (!(collUnits > 0)) {
        console.warn(`[Orders] memo candidate #${cand.id} reports zero collateral — skipped`);
        continue;
      }
      let status: LoanStatus = 'Active';
      if (statusByte === 1) status = 'InGracePeriod';
      else if (statusByte === 2) status = 'Repaid';
      else if (statusByte === 3) status = 'Defaulted';

      ordersMap.set(cand.id, {
        id: cand.id,
        poolId: pool.id,
        poolName: pool.name,
        borrower: borrowerPubkey,
        principalAmount: principalMicro / 1_000_000,
        collateralName: `${collUnits.toFixed(2)} ${isSol ? 'SOL' : 'SKR'}`,
        collateralMint,
        collateralAmount: collUnits,
        interestDue: interestMicro / 1_000_000,
        originationTime: cand.time,
        dueTime,
        gracePeriodExpires,
        status,
        txSignature: cand.sig,
        escrowAddress: escrowPDA.toBase58(),
        solscanUrl: `https://solscan.io/tx/${cand.sig}`,
      });
    }
  } catch (sigErr) {
    console.warn('Signature scan notice:', sigErr);
  }

  return finalizeOrders();
}

// Fetch live P2P pawn offers directly from Devnet contract
export async function fetchLiveP2POffers(
  network: SolanaNetwork = 'mainnet-beta',
  opts?: { force?: boolean }
): Promise<P2POffer[]> {
  return cachedFetch(`offers:${network}`, () => fetchLiveP2POffersUncached(network), opts);
}

async function fetchLiveP2POffersUncached(network: SolanaNetwork): Promise<P2POffer[]> {
  const rpcConn = getConnection(network);
  try {
    // L-3: RPC-side discriminator filter only — the program's P2POffer is
    // 202 bytes with a 170-byte legacy form (state.rs:283/288), so the old
    // 162-byte dataSize fallback could only ever match foreign accounts.
    const accounts = await queryRpcWithFallback(network, (c) =>
      c.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: B58_CLK_PAWN } }] })
    );
    const offers: P2POffer[] = [];

    for (const acc of accounts) {
      if (acc.account.data.length >= 170) {
        const data = Buffer.from(acc.account.data);
        let isInitialized = false;
        let offerId = 0;
        let creator = '';
        let funder = '';
        let collateralMint = '';
        let liquidityMint = USDC_MAINNET_MINT.toBase58();
        let collateralLamports = 0;
        let requestedRaw: string | undefined;
        let interestRaw: string | undefined;
        let durationSeconds = 0;
        let createdAt = 0;
        let dueTime = 0;
        let gracePeriodExpires = 0;
        let statusByte = 0;

        // NEW-4/L-3: discriminator-gated parsing — only CLK_PAWN accounts are
        // offers, and only the two lengths the program defines (202 current,
        // 170 legacy) are decoded.
        const kind = readDiscriminator(data);
        if (kind !== 'CLK_PAWN') continue;
        if (data.length >= 202) {
          isInitialized = data.readUInt8(8) === 1;
          offerId = Number(data.readBigUInt64LE(9));
          creator = new PublicKey(data.subarray(17, 49)).toBase58();
          funder = new PublicKey(data.subarray(49, 81)).toBase58();
          collateralMint = new PublicKey(data.subarray(81, 113)).toBase58();
          liquidityMint = new PublicKey(data.subarray(113, 145)).toBase58();
          collateralLamports = Number(data.readBigUInt64LE(145));
          requestedRaw = data.readBigUInt64LE(153).toString();
          interestRaw = data.readBigUInt64LE(161).toString();
          durationSeconds = Number(data.readBigInt64LE(169));
          createdAt = Number(data.readBigInt64LE(177));
          dueTime = Number(data.readBigInt64LE(185));
          gracePeriodExpires = Number(data.readBigInt64LE(193));
          statusByte = data.readUInt8(201);
        } else if (data.length === 170) {
          isInitialized = data.readUInt8(8) === 1;
          offerId = Number(data.readBigUInt64LE(9));
          creator = new PublicKey(data.subarray(17, 49)).toBase58();
          funder = new PublicKey(data.subarray(49, 81)).toBase58();
          collateralMint = new PublicKey(data.subarray(81, 113)).toBase58();
          collateralLamports = Number(data.readBigUInt64LE(113));
          requestedRaw = data.readBigUInt64LE(121).toString();
          interestRaw = data.readBigUInt64LE(129).toString();
          durationSeconds = Number(data.readBigInt64LE(137));
          createdAt = Number(data.readBigInt64LE(145));
          dueTime = Number(data.readBigInt64LE(153));
          gracePeriodExpires = Number(data.readBigInt64LE(161));
          statusByte = data.readUInt8(169);
        } else {
          continue;
        }

        if (!isInitialized) continue;

        const requestedLamports = requestedRaw ? Number(BigInt(requestedRaw)) : 0;
        const interestLamports = interestRaw ? Number(BigInt(interestRaw)) : 0;
        const requestedAmount = requestedLamports / 1_000_000;
        const interestOffered = interestLamports / 1_000_000;
        const durationDays = Math.max(1, Math.round(durationSeconds / 86400));
        // M-4: decimals from the actual mint (native SOL 9, canonical SKR 6) —
        // unlisted collateral is skipped instead of being shown in invented units.
        const isSkr = collateralMint === SKR_MINT.toBase58();
        const isSolMint =
          collateralMint === NATIVE_SOL_MINT.toBase58() ||
          collateralMint === SystemProgram.programId.toBase58();
        if (!isSkr && !isSolMint) {
          console.warn(`[Offers] offer #${offerId} has unsupported collateral mint ${collateralMint} — skipped`);
          continue;
        }
        const collateralAmount = collateralLamports / (isSkr ? 1_000_000 : 1_000_000_000);
        const collateralName = isSkr
          ? `${collateralAmount.toLocaleString()} SKR`
          : `${collateralAmount.toFixed(2)} SOL`;

        let status: OfferStatus = 'Open';
        if (statusByte === 1) status = 'Funded';
        else if (statusByte === 2) status = 'InGracePeriod';
        else if (statusByte === 3) status = 'Repaid';
        else if (statusByte === 4) status = 'Defaulted';

        const [escrowPDA] = getEscrowPDA(acc.pubkey);

        offers.push({
          id: offerId,
          creator,
          funder: funder === PublicKey.default.toBase58() ? undefined : funder,
          collateralName,
          collateralType: 'Token',
          // processor.rs:2050 rejects a zero collateral amount, so the raw
          // value is the truth (no invented placeholder).
          collateralAmount,
          collateralMint,
          liquidityMint,
          requestedAmount,
          interestOffered,
          requestedAmountRaw: requestedRaw,
          interestOfferedRaw: interestRaw,
          durationDays,
          createdAt,
          dueTime: dueTime > 0 ? dueTime : undefined,
          gracePeriodExpires: gracePeriodExpires > 0 ? gracePeriodExpires : undefined,
          status,
          escrowAddress: escrowPDA.toBase58(),
        });
      }
    }

    return offers;
  } catch (err) {
    console.warn('Error querying live offers:', err);
    return [];
  }
}

// Fetch live UserProfile PDA from Devnet contract
export async function fetchLiveUserProfile(userPubkey: PublicKey, skrHandle: string, network: SolanaNetwork = 'mainnet-beta'): Promise<UserProfile> {
  const rpcConn = getConnection(network);
  try {
    const [profilePDA] = getProfilePDA(userPubkey);
    const accountInfo = await queryRpcWithFallback(network, (c) => c.getAccountInfo(profilePDA));

    if (accountInfo && (accountInfo.data.length === 67 || accountInfo.data.length >= 51)) {
      const data = Buffer.from(accountInfo.data);
      const isV2 = data.length === 67;
      const isInitialized = data.readUInt8(isV2 ? 8 : 0) === 1;

      if (isInitialized) {
        // state.rs UserProfile (67 bytes): discriminator[0..8], is_init[8],
        // user[9..41], staked_skr u64[41..49], loans_completed u32[49..53],
        // loans_defaulted u32[53..57], reputation u16[57..59], locked_skr u64[59..67].
        const stakedSkrMicro = BigInt(data.readBigUInt64LE(isV2 ? 41 : 33).toString());
        // Legacy 51-byte profiles have no locked_skr field; the program
        // reallocs them to 67 with zero padding, so the bond is 0.
        const lockedSkrMicro = isV2 ? BigInt(data.readBigUInt64LE(59).toString()) : 0n;
        const totalLoansCompleted = data.readUInt32LE(isV2 ? 49 : 41);
        const totalLoansDefaulted = data.readUInt32LE(isV2 ? 53 : 45);
        const reputationScore = data.readUInt16LE(isV2 ? 57 : 49);

        // C-2: the discount comes from the program's rule only — it reads
        // available_skr = staked_skr - locked_skr against the 1,000 / 100 SKR
        // thresholds (processor.rs:1905-1916). Reputation is displayed but
        // never grants a discount.
        const aprDiscount = deriveAprDiscountPercent(stakedSkrMicro, lockedSkrMicro);
        const availableMicro = stakedSkrMicro > lockedSkrMicro ? stakedSkrMicro - lockedSkrMicro : 0n;

        return {
          pubkey: userPubkey.toBase58(),
          stakedSkr: Number(stakedSkrMicro) / 1_000_000,
          lockedSkr: Number(lockedSkrMicro) / 1_000_000,
          availableSkr: Number(availableMicro) / 1_000_000,
          totalLoansCompleted,
          totalLoansDefaulted,
          reputationScore,
          tier: tierFromAprDiscount(aprDiscount),
          aprDiscount,
        };
      }
    }
  } catch (err) {
    console.warn('Profile PDA not yet initialized, returning default profile:', err);
  }

  return {
    pubkey: userPubkey.toBase58(),
    stakedSkr: 0,
    lockedSkr: 0,
    availableSkr: 0,
    totalLoansCompleted: 0,
    totalLoansDefaulted: 0,
    reputationScore: 0,
    tier: 'Standard',
    aprDiscount: 0,
  };
}

export interface LeaderboardEntry {
  rank: number;
  pubkey: string;
  skrHandle: string;
  reputationScore: number;
  tier: CreditTier;
  stakedSkr: number;
  /** staked - locked: the balance the program's discount thresholds read. */
  availableSkr: number;
  aprDiscount: number;
  totalLoansCompleted: number;
  totalLoansDefaulted: number;
  isCurrentUser?: boolean;
}

export async function fetchLiveLeaderboard(
  network: SolanaNetwork = 'mainnet-beta',
  currentUserPubkey?: PublicKey
): Promise<LeaderboardEntry[]> {
  try {
    const accounts = await queryRpcWithFallback(network, async (c) => {
      return c.getProgramAccounts(PROGRAM_ID, {
        filters: [{ memcmp: { offset: 0, bytes: B58_CLK_PROF } }],
      });
    });

    const entries: LeaderboardEntry[] = [];
    for (const acc of accounts) {
      if (acc.account.data.length >= 67) {
        const data = Buffer.from(acc.account.data);
        if (readDiscriminator(data) !== 'CLK_PROF') continue;
        const isInit = data.readUInt8(8) === 1;
        if (!isInit) continue;

        const userPk = new PublicKey(data.subarray(9, 41));
        const userPubkeyStr = userPk.toBase58();
        const stakedSkrMicro = BigInt(data.readBigUInt64LE(41).toString());
        const lockedSkrMicro = BigInt(data.readBigUInt64LE(59).toString());
        const totalLoansCompleted = data.readUInt32LE(49);
        const totalLoansDefaulted = data.readUInt32LE(53);
        const reputationScore = data.readUInt16LE(57);

        // C-2: same program rule as the profile — tiering reflects the SKR bond
        // the borrower actually holds, never the reputation score.
        const aprDiscount = deriveAprDiscountPercent(stakedSkrMicro, lockedSkrMicro);

        const skrHandle = `skr_${userPubkeyStr.slice(0, 4).toLowerCase()}..${userPubkeyStr.slice(-4).toLowerCase()}`;

        entries.push({
          rank: 0,
          pubkey: userPubkeyStr,
          skrHandle,
          reputationScore,
          tier: tierFromAprDiscount(aprDiscount),
          stakedSkr: Number(stakedSkrMicro) / 1_000_000,
          availableSkr:
            Number(stakedSkrMicro > lockedSkrMicro ? stakedSkrMicro - lockedSkrMicro : 0n) / 1_000_000,
          aprDiscount,
          totalLoansCompleted,
          totalLoansDefaulted,
          isCurrentUser: currentUserPubkey ? userPk.equals(currentUserPubkey) : false,
        });
      }
    }

    // Sort descending by reputation score, then staked SKR, then loans completed
    entries.sort((a, b) => {
      if (b.reputationScore !== a.reputationScore) return b.reputationScore - a.reputationScore;
      if (b.stakedSkr !== a.stakedSkr) return b.stakedSkr - a.stakedSkr;
      return b.totalLoansCompleted - a.totalLoansCompleted;
    });

    entries.forEach((e, idx) => {
      e.rank = idx + 1;
    });

    return entries;
  } catch (err) {
    console.warn('Leaderboard query error:', err);
    return [];
  }
}

// Live crypto market price cache with real-time Helius WebSocket push & multi-tier fallbacks
export let livePrices = {
  sol: 118.47,
  skr: 0.0205,
  usdc: 1.0,
};
let lastPriceFetchTime = 0;
/** When fetchLivePrices last actually ran its fallback chain (throttle). */
let lastPriceFetchAttempt = 0;

export interface OnChainPriceFeed {
  isInitialized: boolean;
  mint: PublicKey;
  priceMicroUsd: bigint;
  priceUsd: number;
  decimals: number;
  lastUpdatedAt: number;
  authority: PublicKey;
  maxStalenessSeconds: number;
}

/**
 * M-5: the program bounds every pricing read to
 * min(feed.max_staleness_seconds, ADMIN_FEED_MAX_PRICE_AGE_SECS = 600)
 * (processor.rs:1484, 1547; constant at :3646). Feeds store 3600s for
 * monitoring, so the client must apply the same 600s clamp or it would trust
 * a price the program rejects as StaleOraclePrice.
 */
export const PRICE_MAX_AGE_SECS = 600;

export function isFeedFresh(feed: OnChainPriceFeed | null): boolean {
  if (!feed || !feed.isInitialized || feed.priceUsd <= 0) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = nowSec - feed.lastUpdatedAt;
  const feedWindow = feed.maxStalenessSeconds > 0 ? feed.maxStalenessSeconds : PRICE_MAX_AGE_SECS;
  const maxStale = Math.min(feedWindow, PRICE_MAX_AGE_SECS);
  return diff >= 0 && diff <= maxStale;
}

/**
 * H-2: only a feed the program itself would accept may back a price-derived
 * figure. Holds for both the RPC read and the Helius WSS push (both funnel
 * through isFeedFresh, which clamps to 600s).
 *
 * Takes an explicit source: there is deliberately no default. Deciding this
 * from one global "current source" string is what let a fresh SOL feed vouch
 * for a stale SKR leg — ask per asset instead (isAssetPriceUsable).
 */
export function isPriceSourceTrusted(source: PriceSource): boolean {
  return source === 'on-chain-rpc' || source === 'helius-wss';
}

/** The assets this client prices and sizes collateral against. */
export type PriceAsset = 'sol' | 'skr';

// H-2 freshness/trust is tracked PER ASSET. SOL and SKR are independent
// on-chain PriceFeed PDAs and either can stall on its own; a single global flag
// meant a fresh SOL feed marked the whole price set trusted even when the SKR
// leg was stale or unreadable — and that leg then silently fell back to the
// hardcoded baseline in `livePrices` (`skr: 0.0205`), under-collateralising any
// loan sized against it.
const priceSourceByAsset: Record<PriceAsset, PriceSource> = {
  sol: 'fallback-baseline',
  skr: 'fallback-baseline',
};
const priceUpdatedAtByAsset: Record<PriceAsset, number> = { sol: 0, skr: 0 };

/** Least-trusted first; only the top two are trusted (isPriceSourceTrusted). */
const PRICE_SOURCE_RANK: Record<PriceSource, number> = {
  'fallback-baseline': 0,
  coingecko: 1,
  jupiter: 2,
  'helius-wss': 3,
  'on-chain-rpc': 4,
};

/** Record an accepted price for ONE asset, with the source that produced it. */
function recordPriceUpdate(asset: PriceAsset, source: PriceSource, at: number): void {
  priceSourceByAsset[asset] = source;
  priceUpdatedAtByAsset[asset] = at;
  lastPriceFetchTime = at;
}

function getAssetPriceAgeSeconds(asset: PriceAsset): number | null {
  const at = priceUpdatedAtByAsset[asset];
  if (!at) return null;
  return Math.floor((Date.now() - at) / 1000);
}

/**
 * H-2/M-5: a price-derived figure may only be computed for the SPECIFIC asset
 * it is about to value, from that asset's own trusted source and inside the
 * 600s window the program enforces. Never ask this in the aggregate.
 */
export function isAssetPriceUsable(asset: PriceAsset): boolean {
  const age = getAssetPriceAgeSeconds(asset);
  return isPriceSourceTrusted(priceSourceByAsset[asset]) && age !== null && age <= PRICE_MAX_AGE_SECS;
}

/**
 * Worst-case (oldest) age across the assets the aggregate check covers, so a
 * figure shown next to isLivePriceUsable() can never look fresher than the
 * least-fresh leg.
 */
export function getPriceAgeSeconds(): number | null {
  const sol = getAssetPriceAgeSeconds('sol');
  const skr = getAssetPriceAgeSeconds('skr');
  if (sol === null || skr === null) return null;
  return Math.max(sol, skr);
}

/**
 * Conservative aggregate for screens that value more than one asset: true only
 * when EVERY priced asset has its own fresh trusted feed. A screen that sizes
 * against a single asset must use isAssetPriceUsable(asset) instead.
 */
export function isLivePriceUsable(): boolean {
  return isAssetPriceUsable('sol') && isAssetPriceUsable('skr');
}

/**
 * Legacy single-value view. Once freshness is per asset, the only honest
 * aggregate is the weakest leg: a fresh SOL must never make the pair look
 * trusted while SKR is stale. Nothing sizes a loan off this string —
 * isAssetPriceUsable() decides trust.
 */
function aggregatePriceSource(): PriceSource {
  return PRICE_SOURCE_RANK[priceSourceByAsset.sol] <= PRICE_SOURCE_RANK[priceSourceByAsset.skr]
    ? priceSourceByAsset.sol
    : priceSourceByAsset.skr;
}

/**
 * H-9: decode an 8-byte account discriminator WITHOUT Buffer.toString().
 * On Hermes, a typed-array subarray's toString() yields the comma-joined byte
 * values ("67,76,75,..."), not the decoded string — so every
 * `data.subarray(0,8).toString() === 'CLK_*'` check silently failed on-device
 * while passing in Node. Decode byte-by-byte instead; this is engine-agnostic.
 */
export function readDiscriminator(data: Uint8Array | Buffer): string {
  const b = data.subarray(0, 8);
  let s = '';
  for (let i = 0; i < 8 && i < b.length; i++) {
    s += String.fromCharCode(b[i]);
  }
  return s;
}

/**
 * Unpack ClockLend on-chain PriceFeed account (98 bytes)
 * Layout:
 *   [0..8]: discriminator
 *   [8]: is_initialized (u8 bool)
 *   [9..41]: mint (Pubkey)
 *   [41..49]: price_micro_usd (u64 LE)
 *   [49]: decimals (u8)
 *   [50..58]: last_updated_at (i64 LE)
 *   [58..90]: authority (Pubkey)
 *   [90..98]: max_staleness_seconds (i64 LE)
 */
export function unpackPriceFeed(data: Buffer | Uint8Array): OnChainPriceFeed | null {
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length < 98 || readDiscriminator(buf) !== 'CLK_FEED') return null;
    const isInit = buf[8] === 1;
    if (!isInit) return null;
    const mint = new PublicKey(buf.subarray(9, 41));
    const priceMicroUsd = buf.readBigUInt64LE(41);
    const decimals = buf[49];
    const lastUpdatedAt = Number(buf.readBigInt64LE(50));
    const authority = new PublicKey(buf.subarray(58, 90));
    const maxStalenessSeconds = Number(buf.readBigInt64LE(90));

    return {
      isInitialized: isInit,
      mint,
      priceMicroUsd: BigInt(priceMicroUsd.toString()),
      priceUsd: Number(priceMicroUsd) / 1_000_000,
      decimals,
      lastUpdatedAt,
      authority,
      maxStalenessSeconds,
    };
  } catch (_err) {
    return null;
  }
}

// React Native / Hermes safe timeout fetch (AbortSignal.timeout is not implemented in Hermes)
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type PriceSource = 'helius-wss' | 'on-chain-rpc' | 'jupiter' | 'coingecko' | 'fallback-baseline';
export let currentPriceSource: PriceSource = 'fallback-baseline';
export function getPriceSource(): PriceSource {
  return currentPriceSource;
}

type PriceListener = (prices: { sol: number; skr: number; usdc: number }, source: PriceSource) => void;
const priceListeners = new Set<PriceListener>();

/**
 * Subscribe to real-time price updates pushed over Helius WebSocket
 */
export function subscribeToPriceUpdates(listener: PriceListener): () => void {
  priceListeners.add(listener);
  try {
    listener({ ...livePrices }, currentPriceSource);
  } catch (_e) {}
  return () => {
    priceListeners.delete(listener);
  };
}

function notifyPriceListeners() {
  for (const listener of priceListeners) {
    try {
      listener({ ...livePrices }, currentPriceSource);
    } catch (_err) {}
  }
}

let activeSolSubId: number | null = null;
let activeSkrSubId: number | null = null;
let activeNetworkSubscribed: SolanaNetwork | null = null;

/**
 * Initialize Helius WebSocket listener on ClockLend on-chain Oracle PDAs
 */
export function initOracleWebSocketListener(network: SolanaNetwork = 'mainnet-beta') {
  if (activeNetworkSubscribed === network && activeSolSubId !== null && activeSkrSubId !== null) {
    return;
  }

  // Clean up prior subscriptions before establishing new ones (fixes dedupe leak)
  const oldConn = activeNetworkSubscribed ? getConnection(activeNetworkSubscribed) : null;
  if (oldConn) {
    if (activeSolSubId !== null) {
      try { oldConn.removeAccountChangeListener(activeSolSubId); } catch (_) {}
      activeSolSubId = null;
    }
    if (activeSkrSubId !== null) {
      try { oldConn.removeAccountChangeListener(activeSkrSubId); } catch (_) {}
      activeSkrSubId = null;
    }
  }

  activeNetworkSubscribed = network;
  const conn = getConnection(network);
  const [solOraclePDA] = getOraclePDA(NATIVE_SOL_MINT);
  const [skrOraclePDA] = getOraclePDA(SKR_MINT);

  try {
    activeSolSubId = conn.onAccountChange(
      solOraclePDA,
      (accountInfo) => {
        const feed = unpackPriceFeed(accountInfo.data);
        if (isFeedFresh(feed)) {
          livePrices.sol = feed!.priceUsd;
          recordPriceUpdate('sol', 'helius-wss', Date.now());
          // One leg moving does not make the pair trusted: report the weakest
          // recorded leg, never "helius-wss" for the whole price set.
          currentPriceSource = aggregatePriceSource();
          console.log(`[Helius WSS] Live SOL Oracle pushed: $${feed!.priceUsd}`);
          notifyPriceListeners();
        }
      },
      'confirmed'
    );
  } catch (err) {
    console.warn('[Helius WSS] Failed to subscribe to SOL Oracle PDA:', err);
  }

  try {
    activeSkrSubId = conn.onAccountChange(
      skrOraclePDA,
      (accountInfo) => {
        const feed = unpackPriceFeed(accountInfo.data);
        if (isFeedFresh(feed)) {
          livePrices.skr = feed!.priceUsd;
          recordPriceUpdate('skr', 'helius-wss', Date.now());
          // Weakest leg, as above — a fresh SKR push must not vouch for SOL.
          currentPriceSource = aggregatePriceSource();
          console.log(`[Helius WSS] Live SKR Oracle pushed: $${feed!.priceUsd}`);
          notifyPriceListeners();
        }
      },
      'confirmed'
    );
  } catch (err) {
    console.warn('[Helius WSS] Failed to subscribe to SKR Oracle PDA:', err);
  }
}

/**
 * Fetch live prices:
 * 1. Default: ClockLend on-chain Oracle PDAs via Helius RPC / LaserStream WSS
 * 2. Fallback 1: Jupiter Price API (v3/v2)
 * 3. Fallback 2: CoinGecko API
 * 4. Fallback 3: baseline cache (Pyth removed in round 11)
 */
export async function fetchLivePrices(
  network: SolanaNetwork = 'mainnet-beta'
): Promise<{ sol: number; skr: number; usdc: number }> {
  const now = Date.now();

  // Ensure real-time WebSocket stream is active
  initOracleWebSocketListener(network);

  // Only skip the refetch when EVERY leg is already usable from its own
  // trusted, unexpired feed: a stale/unreadable leg is exactly what a refetch
  // can repair, so it must not be short-circuited by the other leg's freshness.
  if (now - lastPriceFetchTime < 10_000 && isAssetPriceUsable('sol') && isAssetPriceUsable('skr')) {
    return livePrices;
  }
  // Refetch attempts (any outcome) stay rate-limited so an asset that is
  // genuinely unavailable cannot turn this into a 3-API call on every caller.
  if (now - lastPriceFetchAttempt < 10_000) {
    return livePrices;
  }
  lastPriceFetchAttempt = now;

  let freshSol = false;
  let freshSkr = false;

  // 1. PRIMARY / DEFAULT: ClockLend On-Chain Oracle PDAs (per-asset staleness checks)
  try {
    const conn = getConnection(network);
    const [solOraclePDA] = getOraclePDA(NATIVE_SOL_MINT);
    const [skrOraclePDA] = getOraclePDA(SKR_MINT);

    const accounts = await conn.getMultipleAccountsInfo([solOraclePDA, skrOraclePDA], 'confirmed');

    if (accounts[0]?.data) {
      const feed = unpackPriceFeed(accounts[0].data);
      if (isFeedFresh(feed)) {
        livePrices.sol = feed!.priceUsd;
        recordPriceUpdate('sol', 'on-chain-rpc', now);
        freshSol = true;
      }
    }

    if (accounts[1]?.data) {
      const feed = unpackPriceFeed(accounts[1].data);
      if (isFeedFresh(feed)) {
        livePrices.skr = feed!.priceUsd;
        recordPriceUpdate('skr', 'on-chain-rpc', now);
        freshSkr = true;
      }
    }

    if (freshSol && freshSkr) {
      currentPriceSource = 'on-chain-rpc';
      notifyPriceListeners();
      return livePrices;
    }
  } catch (oracleErr) {
    console.warn('[Oracle] On-chain read failed, trying fallbacks:', (oracleErr as any)?.message || oracleErr);
  }

  // 2. FALLBACK 1: Jupiter Price API (fetch missing assets)
  const JUPITER_API_URL = process.env.EXPO_PUBLIC_JUPITER_API_URL;
  const JUPITER_API_KEY = process.env.EXPO_PUBLIC_JUPITER_API_KEY;
  const mintIds = [
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', // SKR
  ].join(',');
  const vsToken = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const base = (JUPITER_API_URL || 'https://api.jup.ag').replace(/\/+$/, '');
  const candidates = [
    `${base}/price/v3?ids=${mintIds}`,
    `${base}/price/v2?ids=${mintIds}&vsToken=${vsToken}`,
    `${base}?ids=${mintIds}&vsToken=${vsToken}`,
  ];
  try {
    let jupRes: Response | null = null;
    for (const url of candidates) {
      const r = await fetchWithTimeout(url, {
        headers: JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : undefined,
      }, 3000);
      if (r.ok) { jupRes = r; break; }
    }
    if (jupRes && jupRes.ok) {
      const data = await jupRes.json();
      const byId: Record<string, number> = {};
      if (data?.data && typeof data.data === 'object') {
        for (const [k, v] of Object.entries(data.data)) {
          byId[k] = Number((v as any)?.price);
        }
      } else {
        for (const [k, v] of Object.entries(data)) {
          byId[k] = Number((v as any)?.usdPrice ?? (v as any)?.price);
        }
      }
      if (!freshSol && byId['So11111111111111111111111111111111111111112']) {
        livePrices.sol = byId['So11111111111111111111111111111111111111112'];
        // Attributed to Jupiter, NOT to the on-chain feed: this leg is not one
        // the program would accept (only 'on-chain-rpc'/'helius-wss' are), so a
        // Jupiter-priced SOL must not read as trusted.
        recordPriceUpdate('sol', 'jupiter', now);
        freshSol = true;
      }
      if (byId['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']) {
        livePrices.usdc = byId['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
      }
      if (!freshSkr && byId['SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3']) {
        livePrices.skr = byId['SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'];
        recordPriceUpdate('skr', 'jupiter', now);
        freshSkr = true;
      }
      if (freshSol && freshSkr) {
        currentPriceSource = 'jupiter';
        notifyPriceListeners();
        return livePrices;
      }
    }
  } catch (_err) {
    // fall through to CoinGecko
  }

  // 3. FALLBACK 2: CoinGecko API
  try {
    const res = await fetchWithTimeout(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana,seeker,usd-coin&vs_currencies=usd',
      {},
      3000
    );
    if (res.ok) {
      const data = await res.json();
      if (!freshSol && data?.solana?.usd) {
        livePrices.sol = Number(data.solana.usd);
        recordPriceUpdate('sol', 'coingecko', now);
        freshSol = true;
      }
      if (!freshSkr && data?.seeker?.usd) {
        livePrices.skr = Number(data.seeker.usd);
        recordPriceUpdate('skr', 'coingecko', now);
        freshSkr = true;
      }
      if (data?.['usd-coin']?.usd) {
        livePrices.usdc = Number(data['usd-coin'].usd);
      }
      if (freshSol && freshSkr) {
        currentPriceSource = 'coingecko';
        notifyPriceListeners();
        return livePrices;
      }
    }
  } catch (_err) {
    // fall through
  }

  // Per-asset trust was already recorded at each accept point above; this only
  // derives the legacy single value. It never upgrades a leg: it reports the
  // WEAKEST of the two, so a fresh SOL cannot make the pair look trusted while
  // SKR is stale or was never read. Anything that sizes a loan asks
  // isAssetPriceUsable(asset) for the asset it is about to value.
  currentPriceSource = freshSol || freshSkr ? aggregatePriceSource() : 'fallback-baseline';
  notifyPriceListeners();
  return livePrices;
}

function getKnownTokenSymbol(mint: string): string {
  if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') {
    return 'USDC';
  }
  if (mint === 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263') {
    return 'BONK';
  }
  if (isSeekerGenesisToken(mint)) {
    return 'SGT';
  }
  if (mint === SKR_MINT.toBase58()) {
    return 'SKR';
  }
  return mint.slice(0, 4) + '..' + mint.slice(-4);
}

function getKnownTokenName(mint: string): string {
  if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') {
    return 'USD Coin';
  }
  if (mint === 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263') {
    return 'Bonk';
  }
  if (isSeekerGenesisToken(mint)) {
    return 'Seeker Genesis Token';
  }
  if (mint === SKR_MINT.toBase58()) {
    return 'Seeker Token';
  }
  return 'Solana Token';
}

function calculateTokenUsd(mint: string, amount: number, prices: { sol: number; skr: number; usdc: number } = livePrices): number {
  if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') {
    return parseFloat((amount * prices.usdc).toFixed(2));
  }
  if (mint === SKR_MINT.toBase58()) {
    return parseFloat((amount * prices.skr).toFixed(2));
  }
  if (mint === 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263') {
    return parseFloat((amount * 0.00002).toFixed(2));
  }
  return 0;
}

// Query live user balances across SOL and all SPL token holdings on specified network with multi-RPC fallback
export async function fetchLiveWalletAssets(
  userPubkey: PublicKey,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<WalletAssets> {
  // 1. Query native SOL balance with RPC fallback
  let solLamports = 0;
  try {
    solLamports = await queryRpcWithFallback(network, async (conn) => {
      return await conn.getBalance(userPubkey, 'confirmed');
    });
  } catch (err) {
    console.warn(`[WalletAssets] Error querying SOL balance on ${network}:`, err);
  }
  const solBalance = solLamports / 1_000_000_000;

  // 2. Query SPL tokens from both standard Token Program and Token-2022
  let usdcBalance = 0;
  let skrBalance = 0;
  let bonkBalance = 0;
  let hasSeekerGenesisToken = false;
  const tokenList: TokenAssetItem[] = [];
  const prices = await fetchLivePrices(network);

  // USDC is selected strictly by cluster: a mainnet wallet's USDC is the
  // mainnet mint ONLY, a devnet wallet's is the devnet mint ONLY. Accepting
  // both let an unrelated account carrying the other cluster's mint inflate
  // the balance (and the portfolio total / credit-profile figure built on it).
  const usdcMint = (network === 'devnet' ? USDC_DEVNET_MINT : USDC_MAINNET_MINT).toBase58();

  try {
    const allAccounts = await queryRpcWithFallback(network, async (conn) => {
      const [standardResult, token2022Result] = await Promise.allSettled([
        conn.getParsedTokenAccountsByOwner(userPubkey, { programId: TOKEN_PROGRAM_ID }),
        conn.getParsedTokenAccountsByOwner(userPubkey, { programId: TOKEN_2022_PROGRAM_ID }),
      ]);

      const list: any[] = [];
      if (standardResult.status === 'fulfilled' && standardResult.value?.value) {
        list.push(...standardResult.value.value.map((a) => ({ ...a, isToken2022: false })));
      }
      if (token2022Result.status === 'fulfilled' && token2022Result.value?.value) {
        list.push(...token2022Result.value.value.map((a) => ({ ...a, isToken2022: true })));
      }
      return list;
    });

    for (const item of allAccounts) {
      const info = item.account?.data?.parsed?.info;
      if (!info) continue;

      const mint: string = info.mint || '';
      const amount: number = info.tokenAmount?.uiAmount || 0;
      const decimals: number = info.tokenAmount?.decimals || 0;
      const state: string = info.state || '';

      // Detect Seeker Genesis Token by exact devnet mint or mainnet Token-2022 group mint
      if (isSeekerGenesisToken(mint)) {
        hasSeekerGenesisToken = true;
      }

      // Check for USDC (this cluster's mint only — see usdcMint above)
      if (mint === usdcMint) {
        usdcBalance += amount;
      }
      // Check for SKR (exact canonical mint only)
      else if (mint === SKR_MINT.toBase58()) {
        skrBalance += amount;
      }
      // Check for BONK: exact canonical mint only. A substring match on
      // "bonk" was trivially satisfiable by a grindable junk mint address and
      // let an attacker inflate the total. BONK is display-only here — the
      // program supports neither BONK collateral nor a BONK pool asset.
      else if (mint === 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263') {
        bonkBalance += amount;
      }

      if (amount > 0 || state === 'frozen') {
        tokenList.push({
          mint,
          name: getKnownTokenName(mint),
          symbol: getKnownTokenSymbol(mint),
          amount,
          decimals,
          usdValue: calculateTokenUsd(mint, amount, prices),
          isToken2022: item.isToken2022,
        });
      }
    }
  } catch (err) {
    console.warn(`[WalletAssets] Error querying token accounts on ${network}:`, err);
  }

  const solUsd = solBalance * prices.sol;
  const usdcUsd = usdcBalance * prices.usdc;
  const skrUsd = skrBalance * prices.skr;
  const bonkUsd = bonkBalance * 0.00002;
  const totalUsdValue = parseFloat((solUsd + usdcUsd + skrUsd + bonkUsd).toFixed(2));

  return {
    network,
    solBalance,
    usdcBalance,
    skrBalance,
    bonkBalance,
    hasSeekerGenesisToken,
    totalUsdValue,
    tokenList,
  };
}

// Build Borrow Transaction instruction
export async function buildBorrowTx(
  borrower: PublicKey,
  poolAuthority: PublicKey,
  poolId: number,
  borrowAmountUsdc: number,
  collateralBaseUnits: number,
  durationDays: number,
  collateralName: string = 'SOL',
  isPoolLiquid: boolean = true,
  liquidityMint: PublicKey = USDC_MAINNET_MINT,
  network: SolanaNetwork = 'mainnet-beta',
  options: {
    /**
     * M-6: pool.loans_originated, used to derive a deterministic loan id
     * (deriveLoanId). The id is read back from the loan account after the
     * borrow, so it does not need to be unique across pools.
     */
    poolLoansOriginated?: number;
    /** H-5: pool.has_custom_oracle — carry the pool-scoped feeds when set. */
    hasCustomOracle?: boolean;
  } = {}
): Promise<{ tx: Transaction; escrowPDA: PublicKey; loanId: number; loanPDA: PublicKey }> {
  // C-3: the program reverts with InsufficientLiquidity when
  // pool.total_liquidity < borrow_amount (processor.rs:1348). Refuse to build
  // a transaction that is guaranteed to fail rather than let the user sign it.
  if (!isPoolLiquid) {
    throw new Error(
      'This desk does not have enough liquidity for that amount yet. Try a smaller amount or another desk.'
    );
  }
  const [poolPDA] = getPoolPDA(poolAuthority, poolId);
  const [vaultPDA] = getVaultPDA(poolPDA);
  // M-6: deterministic id (no Math.random) — derivable again from
  // (pool.loans_originated, second) and always read back from the chain.
  const loanId = deriveLoanId(options.poolLoansOriginated ?? 0);
  const [loanPDA] = getLoanPDA(poolPDA, borrower, loanId);
  const [escrowPDA] = getEscrowPDA(loanPDA);
  const [profilePDA] = getProfilePDA(borrower);

  const tx = new Transaction();

  // Layout: 1 byte tag (3) + 8 bytes loan_id + 8 bytes borrow_amount + 8 bytes collateral_amount + 8 bytes duration_seconds = 33 bytes
  const data = Buffer.alloc(33);
  data.writeUInt8(3, 0); // Instruction 3: BorrowFromPool
  writeU64LE(BigInt(loanId)).copy(data, 1);
  writeU64LE(BigInt(Math.round(borrowAmountUsdc * 1_000_000))).copy(data, 9);
  writeU64LE(BigInt(collateralBaseUnits)).copy(data, 17);
  writeU64LE(BigInt(durationDays * 86400)).copy(data, 25);

  const borrowerUsdcAccount = getAssociatedTokenAddress(liquidityMint, borrower);
  const isNativeSol = isNativeSolCollateralName(collateralName);
  const collateralMint = isNativeSol ? SystemProgram.programId : SKR_MINT;
  const borrowerCollateralAccount = isNativeSol
    ? borrower
    : getAssociatedTokenAddress(collateralMint, borrower);

  const [treasuryPDA] = getTreasuryPDA();
  const treasuryUsdcAccount = getAssociatedTokenAddress(liquidityMint, treasuryPDA);
  const oracleMint = isNativeSol ? NATIVE_SOL_MINT : collateralMint;
  const [oraclePDA] = getOraclePDA(oracleMint);

  // Pricing is admin-feed-only (Pyth pull oracles removed in round 11): the
  // program prices from the global/pool-scoped PriceFeed, kept fresh by the
  // keeper crank (Jupiter/CoinGecko via the WS pipeline). No attachment
  // instructions are needed.
  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 })
  );

  const keys: any[] = [
    { pubkey: borrower, isSigner: true, isWritable: true },
    { pubkey: poolPDA, isSigner: false, isWritable: true },
    { pubkey: loanPDA, isSigner: false, isWritable: true },
    { pubkey: vaultPDA, isSigner: false, isWritable: true },
    { pubkey: borrowerUsdcAccount, isSigner: false, isWritable: true },
    { pubkey: borrowerCollateralAccount, isSigner: false, isWritable: true },
    { pubkey: escrowPDA, isSigner: false, isWritable: true },
    { pubkey: collateralMint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: profilePDA, isSigner: false, isWritable: true },
    { pubkey: treasuryUsdcAccount, isSigner: false, isWritable: true },
  ];
  // H-5: a desk that pinned its own feeds requires BOTH pool-scoped oracle
  // PDAs (processor.rs:1457-1465 collateral gate, 1531-1535 liquidity gate).
  // The global feed is deliberately NOT included in that case: the program's
  // trailing scan assigns the first matching account to the slot, so passing
  // the global feed ahead of the pool-scoped one would trip the gate.
  if (options.hasCustomOracle) {
    const poolCollateralOracle = getPoolOraclePDA(poolPDA, collateralMint)[0];
    keys.push({ pubkey: poolCollateralOracle, isSigner: false, isWritable: false });
    if (isNativeSol) {
      // canonical_collateral_mint for native SOL is the native mint id.
      keys.push({ pubkey: getPoolOraclePDA(poolPDA, NATIVE_SOL_MINT)[0], isSigner: false, isWritable: false });
    }
    keys.push({ pubkey: getPoolOraclePDA(poolPDA, liquidityMint)[0], isSigner: false, isWritable: false });
  } else {
    keys.push({ pubkey: oraclePDA, isSigner: false, isWritable: false });
  }
  // Route 50% of the origination fee to the SKR yield vault when it exists
  // and is initialized. If the read fails or the vault is absent, the whole
  // fee goes to the treasury (program behavior) — never revert the borrow
  // over a missing vault.
  try {
    const yieldVault = await fetchSkrYieldVault(network, liquidityMint);
    if (yieldVault?.initialized) {
      keys.push({ pubkey: yieldVault.vaultPDA, isSigner: false, isWritable: true });
      keys.push({ pubkey: yieldVault.vaultTokenPDA, isSigner: false, isWritable: true });
    }
  } catch (_e) {
    // graceful: no fee split
  }

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });
  tx.add(ix);

  // L-8: the memo must print human units. The argument is mint base units
  // (lamports for SOL, micro-SKR for SKR) — the old SKR branch printed raw
  // base units, overstating the deposit by 1e6.
  const collateralLabel = isNativeSol
    ? `${(collateralBaseUnits / 1e9).toFixed(3)} SOL`
    : `${(collateralBaseUnits / 1e6).toLocaleString()} SKR`;
  const memoText = `ClockLend: Borrow #${loanId} $${borrowAmountUsdc} USDC | Collateral: ${collateralLabel} | Pool #${poolId}`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: borrower, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return { tx, escrowPDA, loanId, loanPDA };
}

// ---------------------------------------------------------------------------
// H-4 / M-8: ground-truth reads of a single loan account.
//
// LoanOrder (state.rs, 170 bytes):
//   discriminator[0..8], is_active[8], loan_id[9..17], borrower[17..49],
//   pool[49..81], principal_amount[81..89], collateral_mint[89..121],
//   collateral_amount[121..129], interest_due[129..137], origination_time[137..145],
//   due_time[145..153], grace_period_expires[153..161], status[161], locked_skr[162..170].
// ---------------------------------------------------------------------------
export interface OnChainLoanState {
  loanId: number;
  borrower: string;
  poolPubkey: string;
  principalMicro: bigint;
  collateralMint: string;
  collateralBaseUnits: bigint;
  collateralAmount: number;
  collateralName: string;
  isNativeSol: boolean;
  /** Exact on-chain interest (u128 floor math, processor.rs:1926-1935). */
  interestDueMicro: bigint;
  originationTime: number;
  /** 0 means the program never set it — render as unknown, never invented. */
  dueTime: number;
  gracePeriodExpires: number;
  lockedSkrMicro: bigint;
  status: LoanStatus;
}

export function decodeLoanOrderAccount(data: Buffer | Uint8Array): OnChainLoanState | null {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 170 || readDiscriminator(buf) !== 'CLK_LOAN') return null;
  const collateralMint = new PublicKey(buf.subarray(89, 121)).toBase58();
  const isNativeSol =
    collateralMint === NATIVE_SOL_MINT.toBase58() ||
    collateralMint === SystemProgram.programId.toBase58();
  const isSkr = collateralMint === SKR_MINT.toBase58();
  if (!isNativeSol && !isSkr) return null;
  const collateralBaseUnits = BigInt(buf.readBigUInt64LE(121).toString());
  const collateralAmount = Number(collateralBaseUnits) / (isNativeSol ? 1_000_000_000 : 1_000_000);

  const statusByte = buf.readUInt8(161);
  let status: LoanStatus = 'Active';
  if (statusByte === 1) status = 'InGracePeriod';
  else if (statusByte === 2) status = 'Repaid';
  else if (statusByte === 3) status = 'Defaulted';

  return {
    loanId: Number(buf.readBigUInt64LE(9)),
    borrower: new PublicKey(buf.subarray(17, 49)).toBase58(),
    poolPubkey: new PublicKey(buf.subarray(49, 81)).toBase58(),
    principalMicro: BigInt(buf.readBigUInt64LE(81).toString()),
    collateralMint,
    collateralBaseUnits,
    collateralAmount,
    collateralName: isNativeSol
      ? `${collateralAmount.toFixed(2)} SOL`
      : `${collateralAmount.toLocaleString()} SKR`,
    isNativeSol,
    interestDueMicro: BigInt(buf.readBigUInt64LE(129).toString()),
    originationTime: Number(buf.readBigInt64LE(137)),
    dueTime: Number(buf.readBigInt64LE(145)),
    gracePeriodExpires: Number(buf.readBigInt64LE(153)),
    lockedSkrMicro: BigInt(buf.readBigUInt64LE(162).toString()),
    status,
  };
}

/** Read a loan PDA by (pool, borrower, loan_id). Returns undefined if absent. */
export async function fetchOnChainLoan(
  poolPDA: PublicKey,
  borrower: PublicKey,
  loanId: number,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<OnChainLoanState | undefined> {
  const [loanPDA] = getLoanPDA(poolPDA, borrower, loanId);
  return fetchOnChainLoanByPDA(loanPDA, network);
}

/** Read a loan PDA directly — the read-back path after a borrow confirms. */
export async function fetchOnChainLoanByPDA(
  loanPDA: PublicKey,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<OnChainLoanState | undefined> {
  try {
    const info = await getConnection(network).getAccountInfo(loanPDA, 'confirmed');
    if (!info?.data) return undefined;
    return decodeLoanOrderAccount(Buffer.from(info.data)) ?? undefined;
  } catch (err) {
    console.warn('[Loan] on-chain read failed:', (err as any)?.message || err);
    return undefined;
  }
}

/**
 * M-8: live account subscriptions for the borrower's own loan PDAs. Any
 * program-side change (grace trigger, repayment, default) pushes into
 * onUpdate so the affected views can re-read the chain instead of waiting for
 * a manual refresh. Returns an unsubscribe function.
 */
export function subscribeToUserLoans(
  borrower: PublicKey,
  orders: Array<Pick<LoanOrder, 'id' | 'poolPubkey'>>,
  network: SolanaNetwork,
  onUpdate: () => void
): () => void {
  const conn = getConnection(network);
  const subscriptionIds: number[] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    if (!order.poolPubkey) continue;
    try {
      const [loanPDA] = getLoanPDA(new PublicKey(order.poolPubkey), borrower, order.id);
      const key = loanPDA.toBase58();
      if (seen.has(key)) continue;
      seen.add(key);
      subscriptionIds.push(conn.onAccountChange(loanPDA, () => onUpdate(), 'confirmed'));
    } catch (err) {
      console.warn('[Loans] subscription skipped:', (err as any)?.message || err);
    }
  }
  return () => {
    for (const id of subscriptionIds) {
      try {
        conn.removeAccountChangeListener(id);
      } catch (_e) {
        // connection may already be torn down
      }
    }
  };
}

/**
 * C-3: turn raw program/wallet failures into a message that describes what
 * actually happened. Custom error codes mirror error.rs (ClockLendError
 * variants are `ProgramError::Custom(index)` in declaration order).
 */
export function describeTransactionError(err: any): string {
  const raw: string = `${err?.message ?? err ?? ''}`;
  const lower = raw.toLowerCase();

  const has = (needle: string) => lower.includes(needle.toLowerCase());

  if (has('Cancellation') || has('User rejected') || has('declined')) {
    return 'Transaction was cancelled in your wallet.';
  }
  if (has('InsufficientLiquidity') || has('custom program error: 0xb') || has('"Custom":11')) {
    return 'This desk ran out of liquidity for that amount (InsufficientLiquidity). Try a smaller borrow or another desk.';
  }
  if (has('StaleOraclePrice') || has('custom program error: 0x1d') || has('"Custom":29')) {
    return 'The desk’s price feed is stale right now, so the program refused the borrow. Try again once the keeper refreshes the feed.';
  }
  if (has('InvalidOracleAccount') || has('custom program error: 0x1c') || has('"Custom":28')) {
    return 'This desk requires its own price feed, which the client could not attach. Nothing was charged — please report this desk.';
  }
  if (has('InsufficientCollateral') || has('custom program error: 0x1a') || has('"Custom":26')) {
    return 'The escrowed collateral is below what the program requires for this borrow.';
  }
  if (has('insufficient funds') || has('insufficient lamports')) {
    return 'Your wallet does not have enough SOL to pay the network fee and rent.';
  }
  return raw || 'Could not complete the transaction.';
}

// (InitializeAdmin and SetPriceFeed builders were removed as dead code —
// the deploy/keeper scripts and the smoke encode them directly.)
// Build Repay Transaction instruction
export async function buildRepayTx(
  borrower: PublicKey,
  poolAuthority: PublicKey,
  poolId: number,
  orderId: number,
  repayAmountUsdc: number,
  isPoolLiquid: boolean = true,
  collateralName: string = 'SOL',
  poolPubkeyOverride?: PublicKey,
  liquidityMint: PublicKey = USDC_MAINNET_MINT,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<Transaction> {
  // NEW-2: bind repayment to the loan's actual pool pubkey (read from the loan
  // PDA) instead of re-deriving the pool PDA from a menu-driven (authority, id).
  const [poolPDA] = poolPubkeyOverride
    ? [poolPubkeyOverride]
    : getPoolPDA(poolAuthority, poolId);
  const [vaultPDA] = getVaultPDA(poolPDA);
  const [loanPDA] = getLoanPDA(poolPDA, borrower, orderId);
  const [escrowPDA] = getEscrowPDA(loanPDA);
  const [profilePDA] = getProfilePDA(borrower);
  const borrowerUsdcAccount = getAssociatedTokenAddress(liquidityMint, borrower);
  const [treasuryPDA] = getTreasuryPDA();
  const treasuryUsdcAccount = getAssociatedTokenAddress(liquidityMint, treasuryPDA);

  // L-7: one shared collateral-type test across every builder.
  const isNativeSol = isNativeSolCollateralName(collateralName);
  const borrowerCollateralAccount = isNativeSol
    ? borrower
    : getAssociatedTokenAddress(SKR_MINT, borrower);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // Query on-chain loan state to guarantee exact repayment down to the micro-unit
  let exactRepayLamports = BigInt(Math.round(repayAmountUsdc * 1_000_000));
  try {
    const loanInfo = await getConnection(network).getAccountInfo(loanPDA);
    const loanData = loanInfo?.data;
    // NEW-4: discriminator-gated read of the loan PDA for the exact amount
    if (loanData && loanData.length === 170 && readDiscriminator(loanData) === 'CLK_LOAN') {
      const principal = loanData.readBigUInt64LE(81);
      const interest = loanData.readBigUInt64LE(129);
      exactRepayLamports = BigInt(principal.toString()) + BigInt(interest.toString());
    } else if (loanData && loanData.length === 154) {
      const principal = loanData.readBigUInt64LE(73);
      const interest = loanData.readBigUInt64LE(121);
      exactRepayLamports = BigInt(principal.toString()) + BigInt(interest.toString());
    }
  } catch (err) {
    console.warn('[Repay] exact-amount read failed, using caller amount:', (err as any)?.message || err);
  }

  // Layout: 1 byte tag (6) + 8 bytes repay_amount = 9 bytes
  const data = Buffer.alloc(9);
  data.writeUInt8(6, 0); // Instruction 6: RepayLoan
  writeU64LE(exactRepayLamports).copy(data, 1);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: borrower, isSigner: true, isWritable: true },
      { pubkey: loanPDA, isSigner: false, isWritable: true },
      { pubkey: borrowerUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: borrowerCollateralAccount, isSigner: false, isWritable: true },
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: profilePDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: treasuryUsdcAccount, isSigner: false, isWritable: true },
    ],
    data,
  });
  tx.add(ix);

  const memoText = `ClockLend: Repay $${repayAmountUsdc} USDC | Order #${orderId} Closed | Collateral Released`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: borrower, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}

// Build Withdraw Liquidity Transaction instruction (Pool Authority only)
export async function buildWithdrawLiquidityTx(
  authority: PublicKey,
  poolId: number,
  amountUsdc: number,
  authorityTokenAccount?: PublicKey
): Promise<Transaction> {
  const [poolPDA] = getPoolPDA(authority, poolId);
  const [vaultPDA] = getVaultPDA(poolPDA);
  const userTokenAcc = authorityTokenAccount || getAssociatedTokenAddress(USDC_MAINNET_MINT, authority);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // Layout: 1 byte tag (9) + 8 bytes amount = 9 bytes
  const data = Buffer.alloc(9);
  data.writeUInt8(9, 0); // Instruction 9: WithdrawLiquidity
  writeU64LE(BigInt(Math.round(amountUsdc * 1_000_000))).copy(data, 1);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: userTokenAcc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
  tx.add(ix);

  return tx;
}


// Build Create P2P Pawn Offer Transaction
export async function buildCreateP2POfferTx(
  creator: PublicKey,
  offerId: number,
  assetName: string,
  requestedAmountUsdc: number,
  profitAmountUsdc: number,
  durationDays: number
): Promise<{ tx: Transaction; offerPDA: PublicKey; escrowPDA: PublicKey }> {
  const [offerPDA] = getP2POfferPDA(creator, offerId);
  const [escrowPDA] = getEscrowPDA(offerPDA);

  const tx = new Transaction();

  // Check if asset specifies collateral amount (SOL or SKR)
  // Collateral spec: an EXPLICIT "amount SYMBOL" with an allowlisted symbol.
  // Free-text must never silently map to a different asset — "2 JitoSOL" used
  // to escrow 1.0 native SOL, and a bare "SKR" used to escrow 1000 SKR.
  const solMatch = assetName.match(/^([0-9]*\.?[0-9]+)\s*(SOL)\b/i);
  const skrMatch = assetName.match(/^([0-9]*\.?[0-9]+)\s*(SKR)\b/i);

  let isNativeSol: boolean;
  let collateralMint: PublicKey;
  let collateralAmount: number;
  if (solMatch && solMatch[1]) {
    isNativeSol = true;
    collateralMint = SystemProgram.programId;
    collateralAmount = Math.round(parseFloat(solMatch[1]) * 1_000_000_000);
  } else if (skrMatch && skrMatch[1]) {
    isNativeSol = false;
    collateralMint = SKR_MINT;
    collateralAmount = Math.round(parseFloat(skrMatch[1]) * 1_000_000);
  } else {
    throw new Error(
      `Unsupported collateral: "${assetName}". Only explicit amounts of SOL or SKR are accepted (e.g. "1.5 SOL", "500 SKR").`
    );
  }
  if (collateralAmount <= 0) {
    throw new Error('Collateral amount must be positive');
  }

  const creatorCollateralAccount = isNativeSol
    ? creator
    : getAssociatedTokenAddress(collateralMint, creator);

  const oracleMint = isNativeSol ? NATIVE_SOL_MINT : collateralMint;
  const [oraclePDA] = getOraclePDA(oracleMint);

  // Admin-feed-only pricing (Pyth removed in round 11).
  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 140_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 })
  );

  // ClockLendInstruction::CreateP2POffer (Variant 4):
  // 1 byte tag (4) + 8 bytes offer_id + 8 bytes requested_amount + 8 bytes collateral_amount + 8 bytes interest_offered + 8 bytes duration_seconds = 41 bytes
  const data = Buffer.alloc(41);
  data.writeUInt8(4, 0);
  writeU64LE(BigInt(offerId)).copy(data, 1);
  writeU64LE(BigInt(Math.round(requestedAmountUsdc * 1_000_000))).copy(data, 9);
  writeU64LE(BigInt(collateralAmount)).copy(data, 17);
  writeU64LE(BigInt(Math.round(profitAmountUsdc * 1_000_000))).copy(data, 25);
  writeU64LE(BigInt(durationDays * 86400)).copy(data, 33);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: offerPDA, isSigner: false, isWritable: true },
      { pubkey: creatorCollateralAccount, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: collateralMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: oraclePDA, isSigner: false, isWritable: false },
      { pubkey: USDC_MAINNET_MINT, isSigner: false, isWritable: false },
    ],
    data,
  });
  tx.add(ix);

  const memoText = `ClockLend: Create P2P Pawn Offer #${offerId} | Asset: ${assetName} | Request: $${requestedAmountUsdc} USDC | Profit: $${profitAmountUsdc} | Duration: ${durationDays}d | Escrow: ${escrowPDA.toBase58().slice(0, 8)}...`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: creator, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return { tx, offerPDA, escrowPDA };
}

// Build Fund P2P Pawn Offer Transaction
export async function buildFundP2POfferTx(
  funder: PublicKey,
  offer: P2POffer
): Promise<Transaction> {
  const creator = new PublicKey(offer.creator);
  const [offerPDA] = getP2POfferPDA(creator, offer.id);
  const offerMint = offer.liquidityMint ? new PublicKey(offer.liquidityMint) : USDC_MAINNET_MINT;
  const funderUsdcAccount = getAssociatedTokenAddress(offerMint, funder);
  const creatorUsdcAccount = getAssociatedTokenAddress(offerMint, creator);
  // Index 5: the treasury's token account for this mint, which receives the
  // origination fee. Required by the program — the funder is debited the full
  // requested amount, the creator receives it less the fee. (processor.rs
  // `process_fund_p2p_offer`.)
  const [treasuryPDA] = getTreasuryPDA();
  const treasuryUsdcAccount = getAssociatedTokenAddress(offerMint, treasuryPDA);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // ClockLendInstruction::FundP2POffer (Variant 5)
  const data = Buffer.alloc(1);
  data.writeUInt8(5, 0);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: funder, isSigner: true, isWritable: true },
      { pubkey: offerPDA, isSigner: false, isWritable: true },
      { pubkey: funderUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: creatorUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: treasuryUsdcAccount, isSigner: false, isWritable: true },
    ],
    data,
  });
  tx.add(ix);

  const memoText = `ClockLend: Fund P2P Pawn #${offer.id} | Principal: $${offer.requestedAmount} USDC | Expected Yield: +$${offer.interestOffered} USDC | Funder: ${funder.toBase58().slice(0, 8)}...`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: funder, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}

// Build Repay P2P Pawn Offer Transaction (Borrower repays principal + yield to release collateral)
export async function buildRepayPawnOfferTx(
  borrower: PublicKey,
  offer: P2POffer,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<Transaction> {
  if (!offer.funder) {
    throw new Error('Offer has not been funded yet');
  }
  // The P2P offer PDA is [b"p2p_offer", offer.creator, offer_id] — the CREATOR
  // (program/src/state.rs:11; asserted in this repay path at
  // processor.rs:2675-2683). Create and fund derive from the creator, so
  // deriving from the connected wallet here yielded a different, unrelated
  // account whenever the repayer was not the offer's creator.
  const creator = new PublicKey(offer.creator);
  const [offerPDA] = getP2POfferPDA(creator, offer.id);
  const [escrowPDA] = getEscrowPDA(offerPDA);
  const funder = new PublicKey(offer.funder);
  const offerMint = offer.liquidityMint ? new PublicKey(offer.liquidityMint) : USDC_MAINNET_MINT;
  const borrowerUsdcAccount = getAssociatedTokenAddress(offerMint, borrower);
  const funderUsdcAccount = getAssociatedTokenAddress(offerMint, funder);

  const isNativeSol = isNativeSolCollateralName(offer.collateralName);
  const borrowerCollateralAccount = isNativeSol
    ? borrower
    : getAssociatedTokenAddress(SKR_MINT, borrower);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // H-4: exact repay down to the base unit. Prefer the raw account-derived
  // strings (never round through Number), then the on-chain read, and only as
  // a last resort the caller-supplied float.
  let exactRepayLamports =
    offer.requestedAmountRaw && offer.interestOfferedRaw
      ? BigInt(offer.requestedAmountRaw) + BigInt(offer.interestOfferedRaw)
      : BigInt(Math.round((offer.requestedAmount + offer.interestOffered) * 1_000_000));
  try {
    const offerInfo = await getConnection(network).getAccountInfo(offerPDA);
    const data = offerInfo?.data;
    // NEW-1: read the CURRENT (202-byte) offer layout — requested_amount @153,
    // interest_offered @161 — with the discriminator gate. The legacy 170-byte
    // layout (121/129) is only used for pre-v3 offers.
    if (data && readDiscriminator(data) === 'CLK_PAWN') {
      if (data.length >= 200) {
        const requested = data.readBigUInt64LE(153);
        const interest = data.readBigUInt64LE(161);
        exactRepayLamports = BigInt(requested.toString()) + BigInt(interest.toString());
      } else if (data.length >= 168) {
        const requested = data.readBigUInt64LE(121);
        const interest = data.readBigUInt64LE(129);
        exactRepayLamports = BigInt(requested.toString()) + BigInt(interest.toString());
      }
    }
  } catch (err) {
    console.warn('[Repay] exact-amount read failed, using caller amount:', (err as any)?.message || err);
  }

  // ClockLendInstruction::RepayLoan (Variant 6)
  const data = Buffer.alloc(9);
  data.writeUInt8(6, 0);
  writeU64LE(exactRepayLamports).copy(data, 1);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: borrower, isSigner: true, isWritable: true },
      { pubkey: offerPDA, isSigner: false, isWritable: true },
      { pubkey: borrowerUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: funderUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: borrowerCollateralAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  tx.add(ix);

  const memoText = `ClockLend: Repay P2P Pawn #${offer.id} | Repaid: $${(Number(exactRepayLamports) / 1_000_000).toFixed(2)} USDC | Collateral ${offer.collateralName} Released from Escrow`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: borrower, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}

// Build Cancel P2P Pawn Offer Transaction (Creator withdraws collateral before anyone funds)
export async function buildCancelPawnOfferTx(
  creator: PublicKey,
  offer: P2POffer
): Promise<Transaction> {
  const [offerPDA] = getP2POfferPDA(creator, offer.id);
  const [escrowPDA] = getEscrowPDA(offerPDA);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // Instruction 10: CancelP2POffer (1 byte tag)
  const data = Buffer.alloc(1);
  data.writeUInt8(10, 0);

  const isNativeSol = isNativeSolCollateralName(offer.collateralName);
  const creatorCollateralAccount = isNativeSol ? creator : getAssociatedTokenAddress(SKR_MINT, creator);

  const keys = [
    { pubkey: creator, isSigner: true, isWritable: true },
    { pubkey: offerPDA, isSigner: false, isWritable: true },
    { pubkey: escrowPDA, isSigner: false, isWritable: true },
    { pubkey: creatorCollateralAccount, isSigner: false, isWritable: true },
  ];

  if (!isNativeSol) {
    keys.push({ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false });
  }
  keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });

  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    })
  );

  const memoText = `ClockLend: Cancel P2P Pawn #${offer.id} | Collateral ${offer.collateralName} Withdrawn & Rent Refunded`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: creator, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}

// Build Create Lending Desk / Pool (Individual or Circle) Transaction
export async function buildCreatePoolTx(
  authority: PublicKey,
  poolId: number,
  poolType: 'Individual' | 'Circle',
  name: string,
  interestRateBps: number,
  maxLtvBps: number,
  minDurationDays: number,
  maxDurationDays: number,
  initialLiquidityUsdc: number = 0
): Promise<{ tx: Transaction; poolPDA: PublicKey; vaultPDA: PublicKey }> {
  const [poolPDA] = getPoolPDA(authority, poolId);
  const [vaultPDA] = getVaultPDA(poolPDA);

  const tx = new Transaction();
  // Allocate compute budget: 220k CU if funding atomically, 140k CU if creation only
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: initialLiquidityUsdc > 0 ? 220_000 : 140_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // ClockLendInstruction::InitializePool:
  // Variant tag: 0 (1 byte)
  // pool_id: u64 (8 bytes)
  // pool_type: u8 (1 byte: 0 = Individual, 1 = Circle)
  // interest_rate_bps: u16 (2 bytes)
  // max_ltv_bps: u16 (2 bytes)
  // min_duration: i64 (8 bytes)
  // max_duration: i64 (8 bytes)
  // name: [u8; 32]
  // is_oracle_free: bool (1 byte)
  //
  // Explicit, not inferred from `name`. Keep false so the pool requires a live
  // price feed; true prices collateral from hardcoded baselines and should only
  // be used for a deliberate oracle-free (devnet / test) pool.
  const isOracleFree = false;
  const data = Buffer.alloc(1 + 8 + 1 + 2 + 2 + 8 + 8 + 32 + 1);
  let offset = 0;
  data.writeUInt8(0, offset); offset += 1;
  writeU64LE(BigInt(poolId)).copy(data, offset); offset += 8;
  data.writeUInt8(poolType === 'Circle' ? 1 : 0, offset); offset += 1;
  data.writeUInt16LE(interestRateBps, offset); offset += 2;
  data.writeUInt16LE(maxLtvBps, offset); offset += 2;
  writeU64LE(BigInt(minDurationDays * 86400)).copy(data, offset); offset += 8;
  writeU64LE(BigInt(maxDurationDays * 86400)).copy(data, offset); offset += 8;

  const nameBuf = Buffer.alloc(32);
  Buffer.from(name.slice(0, 32), 'utf-8').copy(nameBuf);
  nameBuf.copy(data, offset); offset += 32;
  data.writeUInt8(isOracleFree ? 1 : 0, offset);

  const liquidityMint = USDC_MAINNET_MINT;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: liquidityMint, isSigner: false, isWritable: false },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  tx.add(ix);

  // If initial liquidity is provided, bundle DepositLiquidity atomically into the same transaction
  if (initialLiquidityUsdc > 0) {
    const userTokenAcc = getAssociatedTokenAddress(USDC_MAINNET_MINT, authority);
    const depositData = Buffer.alloc(9);
    depositData.writeUInt8(1, 0); // Instruction 1: DepositLiquidity
    writeU64LE(BigInt(Math.round(initialLiquidityUsdc * 1_000_000))).copy(depositData, 1);

    const depositIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: userTokenAcc, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: depositData,
    });
    tx.add(depositIx);
  }

  const memoText = initialLiquidityUsdc > 0
    ? `ClockLend: Create & Fund Lending Desk #${poolId} "${name}" | Liquidity: $${initialLiquidityUsdc} USDC | APR: ${(interestRateBps / 100).toFixed(1)}%`
    : `ClockLend: Create Lending Desk #${poolId} "${name}" | Type: ${poolType} | APR: ${(interestRateBps / 100).toFixed(1)}% | Max LTV: ${(maxLtvBps / 100).toFixed(0)}%`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: authority, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return { tx, poolPDA, vaultPDA };
}

// Build Stake SKR Reputation Bond Transaction
export async function buildStakeSkrTx(
  user: PublicKey,
  amountSkr: number,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<{ tx: Transaction; profilePDA: PublicKey; escrowPDA: PublicKey }> {
  const [profilePDA] = getProfilePDA(user);
  const [escrowPDA] = getSkrEscrowPDA(user);
  const userSkrAccount = getAssociatedTokenAddress(SKR_MINT, user);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // ClockLendInstruction::StakeSKR (Variant 2):
  // 1 byte tag (2) + 8 bytes amount = 9 bytes
  const data = Buffer.alloc(9);
  data.writeUInt8(2, 0); // Instruction 2: StakeSKR
  writeU64LE(BigInt(Math.round(amountSkr * 1_000_000))).copy(data, 1);

  // No client-side SOL transfer: the program funds both the profile and the
  // skr_escrow PDAs itself (create_or_allocate_pda from the signer's wallet).
  // An extra transfer here would be a permanent, unrecoverable donation.

  // Execute on-chain StakeSKR instruction. The yield vault + user position
  // for EVERY allowlisted reward mint are REQUIRED sync accounts (H-2): the
  // program no-ops on uninitialized vaults, so the derived PDAs are always
  // appended — a stake that omits them is rejected on-chain and would
  // otherwise freeze the dividend denominator.
  const stakeKeys: any[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: profilePDA, isSigner: false, isWritable: true },
    { pubkey: userSkrAccount, isSigner: false, isWritable: true },
    { pubkey: escrowPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SKR_MINT, isSigner: false, isWritable: false },
  ];
  // Mirrors the on-chain reward-mint allowlist (USDC mainnet, USDC devnet, SKR).
  for (const rewardMint of [USDC_MAINNET_MINT, USDC_DEVNET_MINT, SKR_MINT]) {
    stakeKeys.push({ pubkey: getSkrYieldVaultPDA(rewardMint), isSigner: false, isWritable: true });
    stakeKeys.push({ pubkey: getUserYieldPDA(user, rewardMint), isSigner: false, isWritable: true });
  }
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: stakeKeys,
      data,
    })
  );

  // Memo instruction for on-chain proof & Solscan verification
  // The memo states what the program actually grants: the discount tiers are
  // driven by available SKR only (processor.rs:1905-1916). LTV is a per-desk
  // setting (pool.max_ltv_bps), not an SKR perk.
  const memoText = `ClockLend: Stake ${amountSkr.toLocaleString()} SKR Reputation Bond | User: ${user.toBase58().slice(0, 8)}... | Program APR discount: 1% to 25% continuous scale (100 to 10,000 SKR)`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: user, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return { tx, profilePDA, escrowPDA };
}

// Build Unstake SKR Reputation Bond Transaction
export async function buildUnstakeSkrTx(
  user: PublicKey,
  amountSkr: number,
  network: SolanaNetwork = 'mainnet-beta'
): Promise<{ tx: Transaction; profilePDA: PublicKey; escrowPDA: PublicKey }> {
  const [profilePDA] = getProfilePDA(user);
  const [escrowPDA] = getSkrEscrowPDA(user);
  const userSkrAccount = getAssociatedTokenAddress(SKR_MINT, user);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // ClockLendInstruction::UnstakeSKR (Variant 11):
  // 1 byte tag (11) + 8 bytes amount = 9 bytes
  const data = Buffer.alloc(9);
  data.writeUInt8(11, 0); // Instruction 11: UnstakeSKR
  writeU64LE(BigInt(Math.round(amountSkr * 1_000_000))).copy(data, 1);

  // Execute on-chain UnstakeSKR instruction. The yield vault + user position
  // for EVERY allowlisted reward mint are REQUIRED sync accounts (H-2) so the
  // program always syncs the position DOWN — a recycled stake can never keep
  // earning ghost shares, and omitting them is rejected on-chain.
  const keys: any[] = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: profilePDA, isSigner: false, isWritable: true },
    { pubkey: userSkrAccount, isSigner: false, isWritable: true },
    { pubkey: escrowPDA, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  // Mirrors the on-chain reward-mint allowlist (USDC mainnet, USDC devnet, SKR).
  for (const rewardMint of [USDC_MAINNET_MINT, USDC_DEVNET_MINT, SKR_MINT]) {
    keys.push({ pubkey: getSkrYieldVaultPDA(rewardMint), isSigner: false, isWritable: true });
    keys.push({ pubkey: getUserYieldPDA(user, rewardMint), isSigner: false, isWritable: true });
  }
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    })
  );

  const memoText = `ClockLend: Unstake ${amountSkr.toLocaleString()} SKR | User: ${user.toBase58().slice(0, 8)}...`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: user, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return { tx, profilePDA, escrowPDA };
}

// Build Withdraw Treasury Transaction instruction (Admin only - H-2)
export async function buildWithdrawTreasuryTx(
  admin: PublicKey,
  amountLamports: bigint,
  destination: PublicKey,
  isSpl: boolean = false,
  mint?: PublicKey
): Promise<Transaction> {
  const [adminPDA] = getAdminPDA();
  const [treasuryPDA] = getTreasuryPDA();

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // Variant 14: WithdrawTreasury { amount: u64 } -> 1 byte tag (14) + 8 bytes = 9 bytes
  const data = Buffer.alloc(9);
  data.writeUInt8(14, 0);
  writeU64LE(amountLamports).copy(data, 1);

  const keys = [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: adminPDA, isSigner: false, isWritable: false },
    { pubkey: treasuryPDA, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
  ];

  if (isSpl && mint) {
    const treasuryTokenAcc = getAssociatedTokenAddress(mint, treasuryPDA);
    keys.push(
      { pubkey: treasuryTokenAcc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    );
  } else {
    keys.push(
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    );
  }

  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    })
  );

  return tx;
}

// Build Deposit Liquidity Transaction instruction (ClockLend Instruction 1 - Pool Authority only)
export async function buildDepositLiquidityTx(
  authority: PublicKey,
  poolId: number,
  amountUsdc: number,
  authorityTokenAccount?: PublicKey
): Promise<Transaction> {
  const [poolPDA] = getPoolPDA(authority, poolId);
  const [vaultPDA] = getVaultPDA(poolPDA);
  const userTokenAcc = authorityTokenAccount || getAssociatedTokenAddress(USDC_MAINNET_MINT, authority);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // Instruction 1: DepositLiquidity { amount: u64 } -> 1 byte tag (1) + 8 bytes amount = 9 bytes
  const data = Buffer.alloc(9);
  data.writeUInt8(1, 0);
  writeU64LE(BigInt(Math.round(amountUsdc * 1_000_000))).copy(data, 1);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: userTokenAcc, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
  tx.add(ix);

  const memoText = `ClockLend: Deposit $${amountUsdc} USDC Liquidity into Pool #${poolId}`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: authority, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}

// Build Trigger Grace Period Transaction instruction (ClockLend Instruction 7)
export async function buildTriggerGracePeriodTx(
  caller: PublicKey,
  targetPDA: PublicKey,
  poolPDA?: PublicKey
): Promise<Transaction> {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // Instruction 7: TriggerGracePeriod -> 1 byte tag (7)
  const data = Buffer.alloc(1);
  data.writeUInt8(7, 0);

  const keys = [
    { pubkey: caller, isSigner: true, isWritable: true },
    { pubkey: targetPDA, isSigner: false, isWritable: true },
  ];
  if (poolPDA) {
    keys.push({ pubkey: poolPDA, isSigner: false, isWritable: false });
  }
  keys.push({ pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false });

  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    })
  );

  const memoText = `ClockLend: Trigger 24h Social Grace Period for ${targetPDA.toBase58().slice(0, 8)}...`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: caller, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}

// Build Claim Default Transaction instruction (ClockLend Instruction 8)
export async function buildClaimDefaultTx(
  caller: PublicKey,
  targetPDA: PublicKey,
  escrowPDA: PublicKey,
  destinationCollateralAccount: PublicKey,
  options: {
    poolPDA?: PublicKey;
    borrower?: PublicKey;
    isNativeSol?: boolean;
    /** Collateral mint: derives the price feed and the surplus destinations. */
    collateralMint?: PublicKey;
    /** Desk pinned its own feeds — the pool-scoped feed must be used. */
    hasCustomOracle?: boolean;
  } = {}
): Promise<Transaction> {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));

  // Instruction 8: ClaimDefault -> 1 byte tag (8)
  const data = Buffer.alloc(1);
  data.writeUInt8(8, 0);

  const isNativeSol = options.isNativeSol ?? true;
  const collateralMint = options.collateralMint ?? (isNativeSol ? NATIVE_SOL_MINT : SKR_MINT);

  const keys = [
    { pubkey: caller, isSigner: true, isWritable: true },
    { pubkey: targetPDA, isSigner: false, isWritable: true },
    { pubkey: escrowPDA, isSigner: false, isWritable: true },
    { pubkey: destinationCollateralAccount, isSigner: false, isWritable: true },
  ];

  if (options.poolPDA) {
    keys.push({ pubkey: options.poolPDA, isSigner: false, isWritable: true });
    if (options.borrower) {
      const [profilePDA] = getProfilePDA(options.borrower);
      keys.push({ pubkey: profilePDA, isSigner: false, isWritable: true });
    }
  }

  // ORDER MATTERS: the treasury PDA must precede any other bare wallet. The
  // program's account scan assigns the first non-token account that is not a
  // known PDA to the treasury slot, so a borrower wallet sent first would be
  // mistaken for the treasury and the priced split would fail closed with
  // InvalidTreasuryAccount.
  const [treasuryPDA] = getTreasuryPDA();
  keys.push({ pubkey: treasuryPDA, isSigner: false, isWritable: true });

  if (!isNativeSol) {
    // The platform's share of the surplus is paid in the collateral mint.
    keys.push({
      pubkey: getAssociatedTokenAddress(collateralMint, treasuryPDA),
      isSigner: false,
      isWritable: true,
    });
  }

  // Where the borrower's share of the surplus goes. Without it the program
  // cannot pay a surplus and falls back to seizing the WHOLE escrow — so
  // omitting this silently changes the economics of a default.
  if (options.borrower) {
    keys.push({
      pubkey: isNativeSol
        ? options.borrower
        : getAssociatedTokenAddress(collateralMint, options.borrower),
      isSigner: false,
      isWritable: true,
    });
  }

  // The collateral feed, so the lender is paid only what the debt is worth. A
  // desk that pinned its own feeds is liquidated at the pool-scoped price — a
  // global feed alone is rejected there (H-3 mirror), which would silently
  // downgrade the split, so send the pool-scoped one when the desk has it.
  if (options.hasCustomOracle && options.poolPDA) {
    keys.push({
      pubkey: getPoolOraclePDA(options.poolPDA, collateralMint)[0],
      isSigner: false,
      isWritable: false,
    });
    if (isNativeSol) {
      keys.push({
        pubkey: getPoolOraclePDA(options.poolPDA, NATIVE_SOL_MINT)[0],
        isSigner: false,
        isWritable: false,
      });
    }
  } else {
    keys.push({
      pubkey: getOraclePDA(isNativeSol ? NATIVE_SOL_MINT : collateralMint)[0],
      isSigner: false,
      isWritable: false,
    });
  }

  keys.push(
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
  );

  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    })
  );

  const memoText = `ClockLend: Claim Default & Liquidate Collateral for ${targetPDA.toBase58().slice(0, 8)}...`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: caller, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}

// Build Claim Default for an Active Desk LoanOrder (pool authority settles the
// loan from collateral; no SKR is slashed — the bond is only released)
export async function buildClaimLoanDefaultTx(
  authority: PublicKey,
  order: LoanOrder,
  pool?: LendingPool
): Promise<Transaction> {
  const poolPDA = order.poolPubkey ? new PublicKey(order.poolPubkey) : getPoolPDA(authority, order.poolId)[0];
  const borrower = new PublicKey(order.borrower);
  const [loanPDA] = getLoanPDA(poolPDA, borrower, order.id);
  const [escrowPDA] = getEscrowPDA(loanPDA);
  const isNativeSol = isNativeSolCollateralName(order.collateralName);
  const collateralMint = isNativeSol ? NATIVE_SOL_MINT : SKR_MINT;
  const authorityCollateralAta = getAssociatedTokenAddress(collateralMint, authority);
  const destinationCollateral = isNativeSol ? authority : authorityCollateralAta;

  return buildClaimDefaultTx(
    authority,
    loanPDA,
    escrowPDA,
    destinationCollateral,
    {
      poolPDA,
      borrower,
      isNativeSol,
      collateralMint,
      // A desk with its own feeds must be liquidated at the pool-scoped price.
      hasCustomOracle: pool?.hasCustomOracle,
    }
  );
}

// Build Claim Default for a P2P Pawn (funder is paid the debt's worth of the
// locked collateral; any surplus splits between the creator and the treasury)
export async function buildClaimPawnDefaultTx(
  funder: PublicKey,
  offer: P2POffer
): Promise<Transaction> {
  const creator = new PublicKey(offer.creator);
  const [offerPDA] = getP2POfferPDA(creator, offer.id);
  const [escrowPDA] = getEscrowPDA(offerPDA);
  const isNativeSol = isNativeSolCollateralName(offer.collateralName);
  const collateralMint = isNativeSol ? NATIVE_SOL_MINT : SKR_MINT;
  const destinationCollateral = isNativeSol ? funder : getAssociatedTokenAddress(collateralMint, funder);

  return buildClaimDefaultTx(
    funder,
    offerPDA,
    escrowPDA,
    destinationCollateral,
    {
      isNativeSol,
      collateralMint,
      // For a pawn, the borrower is the offer's creator — this is where their
      // share of any surplus is paid. Omitting it would hand the funder the
      // whole escrow.
      borrower: creator,
    }
  );
}

// Build Trigger 24h Social Grace Period for a P2P Pawn (Creator or Funder)
export async function buildTriggerPawnGraceTx(
  caller: PublicKey,
  offer: P2POffer
): Promise<Transaction> {
  const creator = new PublicKey(offer.creator);
  const [offerPDA] = getP2POfferPDA(creator, offer.id);
  return buildTriggerGracePeriodTx(caller, offerPDA);
}

// Build Claim SKR Protocol Fee Dividends Transaction (Zero Cooldown, Instant USDC Payout)
// ---------------- SKR yield vault (round-9 hardened ABI) ----------------

export interface SkrYieldVaultState {
  vaultPDA: PublicKey;
  vaultTokenPDA: PublicKey;
  initialized: boolean;
  authority: string;
  rewardMint: string;
  totalStakedSkr: number;        // SKR base units
  accRewardPerShare: bigint;     // 1e12-scaled
  totalRewardsDistributed: number;
  pendingRewards: number;
  unallocatedRewards: number;
}

export interface UserYieldPositionState {
  positionPDA: PublicKey;
  initialized: boolean;
  stakedSkr: number;             // SKR base units
  rewardDebt: bigint;            // 1e12-scaled
  accruedRewards: number;        // reward-mint base units
  totalClaimed: number;
  lastInteractionTime: number;
}

export function getSkrYieldVaultPDA(rewardMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([SKR_YIELD_VAULT_SEED, rewardMint.toBuffer()], PROGRAM_ID);
  return pda;
}
export function getSkrYieldTokenPDA(rewardMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([SKR_YIELD_TOKEN_SEED, rewardMint.toBuffer()], PROGRAM_ID);
  return pda;
}
export function getUserYieldPDA(user: PublicKey, rewardMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([USER_YIELD_SEED, user.toBuffer(), rewardMint.toBuffer()], PROGRAM_ID);
  return pda;
}

/** Read the on-chain vault (121-byte CLK_SYLD layout); undefined if absent. */
export async function fetchSkrYieldVault(
  network: SolanaNetwork,
  rewardMint: PublicKey,
  opts?: { force?: boolean }
): Promise<SkrYieldVaultState | undefined> {
  return cachedFetch(`yieldvault:${network}:${rewardMint.toBase58()}`, () => fetchSkrYieldVaultUncached(network, rewardMint), opts);
}

async function fetchSkrYieldVaultUncached(
  network: SolanaNetwork,
  rewardMint: PublicKey
): Promise<SkrYieldVaultState | undefined> {
  try {
    const vaultPDA = getSkrYieldVaultPDA(rewardMint);
    const info = await queryRpcWithFallback(network, (c) => c.getAccountInfo(vaultPDA));
    if (!info || info.data.length < 121 || Buffer.from(info.data.subarray(0, 8)).toString() !== 'CLK_SYLD') {
      return undefined;
    }
    const d = Buffer.from(info.data);
    return {
      vaultPDA,
      vaultTokenPDA: getSkrYieldTokenPDA(rewardMint),
      initialized: d.readUInt8(8) === 1,
      authority: new PublicKey(d.subarray(9, 41)).toBase58(),
      rewardMint: new PublicKey(d.subarray(41, 73)).toBase58(),
      totalStakedSkr: Number(d.readBigUInt64LE(73)),
      accRewardPerShare: BigInt(d.readBigUInt64LE(81).toString()) + BigInt(d.readBigUInt64LE(89).toString()) * 18446744073709551616n,
      totalRewardsDistributed: Number(d.readBigUInt64LE(97)),
      pendingRewards: Number(d.readBigUInt64LE(105)),
      unallocatedRewards: Number(d.readBigUInt64LE(113)),
    };
  } catch (err) {
    console.warn('[Yield] vault read failed:', (err as any)?.message || err);
    return undefined;
  }
}

/** Read the user's yield position (121-byte CLK_UYLD layout); undefined if absent. */
export async function fetchUserYieldPosition(
  network: SolanaNetwork,
  user: PublicKey,
  rewardMint: PublicKey,
  opts?: { force?: boolean }
): Promise<UserYieldPositionState | undefined> {
  return cachedFetch(
    `yieldpos:${network}:${user.toBase58()}:${rewardMint.toBase58()}`,
    () => fetchUserYieldPositionUncached(network, user, rewardMint),
    opts
  );
}

async function fetchUserYieldPositionUncached(
  network: SolanaNetwork,
  user: PublicKey,
  rewardMint: PublicKey
): Promise<UserYieldPositionState | undefined> {
  try {
    const positionPDA = getUserYieldPDA(user, rewardMint);
    const info = await queryRpcWithFallback(network, (c) => c.getAccountInfo(positionPDA));
    if (!info || info.data.length < 121 || Buffer.from(info.data.subarray(0, 8)).toString() !== 'CLK_UYLD') {
      return undefined;
    }
    const d = Buffer.from(info.data);
    return {
      positionPDA,
      initialized: d.readUInt8(8) === 1,
      stakedSkr: Number(d.readBigUInt64LE(73)),
      rewardDebt: BigInt(d.readBigUInt64LE(81).toString()) + BigInt(d.readBigUInt64LE(89).toString()) * 18446744073709551616n,
      accruedRewards: Number(d.readBigUInt64LE(97)),
      totalClaimed: Number(d.readBigUInt64LE(105)),
      lastInteractionTime: Number(d.readBigInt64LE(113)),
    };
  } catch (err) {
    console.warn('[Yield] position read failed:', (err as any)?.message || err);
    return undefined;
  }
}

/** Instruction 15: admin-gated vault init (requires AdminConfig PDA). */
export async function buildInitializeSkrYieldVaultTx(
  authority: PublicKey,
  rewardMint: PublicKey = USDC_MAINNET_MINT
): Promise<Transaction> {
  const vaultPDA = getSkrYieldVaultPDA(rewardMint);
  const vaultTokenPDA = getSkrYieldTokenPDA(rewardMint);
  const [adminPDA] = getAdminPDA();

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: rewardMint, isSigner: false, isWritable: false },
        { pubkey: vaultTokenPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: adminPDA, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([15]),
    })
  );
  return tx;
}

/** Instruction 16: authority-gated dividend deposit. */
export async function buildDepositSkrYieldTx(
  depositor: PublicKey,
  amountUsdc: number,
  rewardMint: PublicKey = USDC_MAINNET_MINT
): Promise<Transaction> {
  const vaultPDA = getSkrYieldVaultPDA(rewardMint);
  const vaultTokenPDA = getSkrYieldTokenPDA(rewardMint);
  const depositorToken = getAssociatedTokenAddress(rewardMint, depositor);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
  const data = Buffer.alloc(9);
  data.writeUInt8(16, 0);
  writeU64LE(BigInt(Math.round(amountUsdc * 1_000_000))).copy(data, 1);
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: depositor, isSigner: true, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: depositorToken, isSigner: false, isWritable: true },
        { pubkey: vaultTokenPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    })
  );
  return tx;
}

/** Instruction 18: authority-only recovery of externally-donated vault
 *  tokens (balance - pending_rewards). */
export async function buildWithdrawUnusedYieldTx(
  authority: PublicKey,
  rewardMint: PublicKey = USDC_MAINNET_MINT
): Promise<Transaction> {
  const vaultPDA = getSkrYieldVaultPDA(rewardMint);
  const vaultTokenPDA = getSkrYieldTokenPDA(rewardMint);
  const authorityToken = getAssociatedTokenAddress(rewardMint, authority);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: vaultTokenPDA, isSigner: false, isWritable: true },
        { pubkey: authorityToken, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([18]),
    })
  );
  return tx;
}

/** Instruction 17: claim dividends. Stake is read from the SKR escrow token
 *  account (account 7). The reward ATA is created idempotently. */
export async function buildClaimSkrYieldTx(
  user: PublicKey,
  rewardMint: PublicKey = USDC_MAINNET_MINT
): Promise<Transaction> {
  const vaultPDA = getSkrYieldVaultPDA(rewardMint);
  const vaultTokenPDA = getSkrYieldTokenPDA(rewardMint);
  const userYieldPDA = getUserYieldPDA(user, rewardMint);
  const [escrowPDA] = getSkrEscrowPDA(user);
  const userRewardAccount = getAssociatedTokenAddress(rewardMint, user);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
  // The program unpacks the reward account whenever there is something to
  // claim — create it idempotently so the first real claim never reverts.
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      userRewardAccount,
      user,
      rewardMint
    )
  );
  // Instruction 17: ClaimSkrYield
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: userYieldPDA, isSigner: false, isWritable: true },
        { pubkey: vaultTokenPDA, isSigner: false, isWritable: true },
        { pubkey: userRewardAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: escrowPDA, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([17]),
    })
  );

  const memoText = `ClockLend: Claim SKR Protocol Fee Yield Dividends (1h cooldown applies)`;
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: user, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, 'utf-8'),
    })
  );

  return tx;
}
