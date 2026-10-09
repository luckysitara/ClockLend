import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';

export interface Env {
  PROGRAM_ID?: string;
  RPC_URL?: string;
  NETWORK?: string;
  ORACLE_KEYPAIR?: string;
  JUPITER_API_KEY?: string;
  CRANK_AUTH_TOKEN?: string;
  PRIORITY_FEE_MICRO_LAMPORTS?: string;
}

// Canonical Constants
const DEFAULT_PROGRAM_ID = '4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7';
const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const SKR_MINT = new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
const ADMIN_SEED = Buffer.from('admin');
const ORACLE_SEED = Buffer.from('oracle');

// Program/staleness bounds.
// TARGET_PROGRAM_ID is the mainnet-beta deployment; a worker pointed at any other
// program id is almost certainly misconfigured, so we surface that in /health.
const TARGET_PROGRAM_ID = '4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7';
// The on-chain program caps admin-feed pricing at ADMIN_FEED_MAX_PRICE_AGE_SECS = 600
// (program/src/processor.rs: `feed.max_staleness_seconds.min(ADMIN_FEED_MAX_PRICE_AGE_SECS)`).
// The stored feed window is 3600s "retained for monitoring" only. Alert before the
// 600s cliff so a human can intervene while the feed is still usable.
const ONCHAIN_PRICE_AGE_LIMIT_SECONDS = 600;
const STALENESS_ALERT_SECONDS = 540;

// Endpoint fallbacks. Defaults are MAINNET so an unconfigured deploy cranks the
// deployed mainnet feeds rather than silently writing devnet.
const MAINNET_RPC_FALLBACK = 'https://api.mainnet-beta.solana.com';
const DEVNET_RPC_FALLBACK = 'https://api.devnet.solana.com';

// Genesis hashes captured live from each public endpoint via getGenesisHash.
// Used to prove the RPC endpoint matches the intended cluster before signing.
const GENESIS_HASHES: Record<string, string> = {
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

function resolveNetwork(env: Env): string {
  const raw = (env.NETWORK || 'mainnet-beta').trim().toLowerCase();
  if (raw === 'devnet' || raw === 'testnet') return 'devnet';
  if (raw === 'local' || raw === 'localnet' || raw === 'localhost') return 'localnet';
  return 'mainnet-beta';
}

/**
 * True only for a loopback HTTP RPC endpoint.
 *
 * `localnet` cannot be identified by genesis hash — a `solana-test-validator`
 * mints a fresh random genesis on every run — so it is validated by ENDPOINT,
 * and only a loopback host qualifies. This is what stops NETWORK=localnet from
 * becoming a way to bypass the cluster guard: pointing it at a remote endpoint
 * is rejected rather than accepted, so mainnet and devnet stay as strictly
 * enforced as before. Mirrors `scripts/lib/cluster-guard.mjs`.
 */
function isLoopbackRpc(rpcUrl: string): boolean {
  try {
    const u = new URL(String(rpcUrl));
    if (u.protocol !== 'http:' && u.protocol !== 'ws:') return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

function resolveRpcUrl(env: Env): string {
  if (env.RPC_URL && env.RPC_URL.trim()) return env.RPC_URL.trim();
  return resolveNetwork(env) === 'devnet' ? DEVNET_RPC_FALLBACK : MAINNET_RPC_FALLBACK;
}
// NOTE: localnet has no fallback endpoint by design — it must be given explicitly
// via RPC_URL, so a mistyped NETWORK cannot silently pick up a public cluster.

/** Fail closed if the RPC endpoint is not the cluster we intend to sign for. */
async function assertExpectedCluster(connection: Connection, env: Env): Promise<string> {
  const network = resolveNetwork(env);

  if (network === 'localnet') {
    const endpoint = (connection as any)?.rpcEndpoint || resolveRpcUrl(env);
    if (!isLoopbackRpc(endpoint)) {
      throw new Error(
        `CLUSTER MISMATCH: NETWORK=localnet requires a loopback RPC endpoint, but got ` +
          `${endpoint || '(unset)'}. A test validator's genesis is random, so localnet is ` +
          `authorised by endpoint and only 127.0.0.1/localhost qualifies.`
      );
    }
    return await connection.getGenesisHash();
  }

  const expected = GENESIS_HASHES[network];
  let actual: string;
  try {
    actual = await connection.getGenesisHash();
  } catch (err: any) {
    throw new Error(`Could not read genesis hash from RPC endpoint: ${err.message || err}`);
  }
  if (actual !== expected) {
    const other = Object.entries(GENESIS_HASHES).find(([, h]) => h === actual)?.[0] || 'unrecognized cluster';
    throw new Error(
      `CLUSTER MISMATCH: NETWORK=${network} expects genesis ${expected}, ` +
        `but the RPC endpoint reports ${actual} (${other}). Refusing to sign.`
    );
  }
  return actual;
}

// Best-effort in-isolate record of the last successful crank. Cloudflare isolates
// are recycled freely, so this is a hint for /health, not durable state.
let lastCrankResult: {
  signature: string;
  solPrice: number;
  skrPrice: number;
  timestamp: string;
} | null = null;

// Helper to write 64-bit integer in little-endian format
function writeU64LE(val: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  const big = BigInt(val);
  buf.writeUInt32LE(Number(big & 0xffffffffn), 0);
  buf.writeUInt32LE(Number((big >> 32n) & 0xffffffffn), 4);
  return buf;
}

// Helper to parse keypair from Base58 string or JSON array
export function parseKeypair(raw: string): Keypair {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const bytes = Uint8Array.from(JSON.parse(trimmed));
    return Keypair.fromSecretKey(bytes);
  }
  // Base58 format
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

// Fetch live prices with Jupiter primary and CoinGecko fallback
export async function fetchMarketPrices(jupiterApiKey?: string): Promise<{ sol: number; skr: number; source: string }> {
  let solPrice: number | null = null;
  let skrPrice: number | null = null;

  // 1. Primary: Jupiter Price API v3
  try {
    const headers: Record<string, string> = {};
    if (jupiterApiKey) headers['x-api-key'] = jupiterApiKey;

    const jupUrl = `https://api.jup.ag/price/v3?ids=${NATIVE_SOL_MINT.toBase58()},${SKR_MINT.toBase58()}`;
    const res = await fetch(jupUrl, { headers });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.[NATIVE_SOL_MINT.toBase58()]?.usdPrice) {
        solPrice = Number(data[NATIVE_SOL_MINT.toBase58()].usdPrice);
      }
      if (data?.[SKR_MINT.toBase58()]?.usdPrice) {
        skrPrice = Number(data[SKR_MINT.toBase58()].usdPrice);
      }
    }
  } catch (err) {
    console.warn('[Serverless Oracle] Jupiter fetch failed, falling back to CoinGecko:', err);
  }

  // 2. Fallback: CoinGecko simple price
  if (solPrice === null || skrPrice === null) {
    try {
      const cgUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=solana,seeker&vs_currencies=usd';
      const res = await fetch(cgUrl);
      if (res.ok) {
        const data = (await res.json()) as any;
        if (solPrice === null && data?.solana?.usd) solPrice = Number(data.solana.usd);
        if (skrPrice === null && data?.seeker?.usd) skrPrice = Number(data.seeker.usd);
      }
    } catch (err) {
      console.warn('[Serverless Oracle] CoinGecko fetch failed:', err);
    }
  }

  // Sanity validation: prices must be positive and non-zero
  if (solPrice === null || skrPrice === null || isNaN(solPrice) || isNaN(skrPrice) || solPrice <= 0 || skrPrice <= 0) {
    throw new Error(`Unable to fetch valid live market prices: SOL=${solPrice}, SKR=${skrPrice}`);
  }

  return { sol: solPrice, skr: skrPrice, source: solPrice && skrPrice ? 'jupiter' : 'coingecko' };
}

// Core Crank Execution
export async function crankOracles(env: Env): Promise<{
  success: boolean;
  signature?: string;
  solPrice: number;
  skrPrice: number;
  authority: string;
  timestamp: string;
}> {
  if (!env.ORACLE_KEYPAIR) {
    throw new Error('ORACLE_KEYPAIR environment secret is not configured.');
  }

  const programId = new PublicKey(env.PROGRAM_ID || DEFAULT_PROGRAM_ID);
  const rpcUrl = resolveRpcUrl(env);
  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertExpectedCluster(connection, env);

  const authority = parseKeypair(env.ORACLE_KEYPAIR);
  const [adminPDA] = PublicKey.findProgramAddressSync([ADMIN_SEED], programId);
  const [solOraclePDA] = PublicKey.findProgramAddressSync([ORACLE_SEED, NATIVE_SOL_MINT.toBuffer()], programId);
  const [skrOraclePDA] = PublicKey.findProgramAddressSync([ORACLE_SEED, SKR_MINT.toBuffer()], programId);

  // Fetch prices
  const { sol, skr, source } = await fetchMarketPrices(env.JUPITER_API_KEY);
  console.log(`[Serverless Oracle] Prices resolved (${source}): SOL=$${sol.toFixed(2)}, SKR=$${skr.toFixed(5)}`);

  const solPriceMicro = BigInt(Math.round(sol * 1e6));
  const skrPriceMicro = BigInt(Math.round(skr * 1e6));

  // Build SOL instruction (Variant 12: SetPriceFeed, 9 decimals)
  const solData = Buffer.alloc(10);
  solData.writeUInt8(12, 0);
  writeU64LE(solPriceMicro).copy(solData, 1);
  solData.writeUInt8(9, 9);

  const solIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: solOraclePDA, isSigner: false, isWritable: true },
      { pubkey: NATIVE_SOL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: adminPDA, isSigner: false, isWritable: false },
    ],
    data: solData,
  });

  // Build SKR instruction (Variant 12: SetPriceFeed, 6 decimals)
  const skrData = Buffer.alloc(10);
  skrData.writeUInt8(12, 0);
  writeU64LE(skrPriceMicro).copy(skrData, 1);
  skrData.writeUInt8(6, 9);

  const skrIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: skrOraclePDA, isSigner: false, isWritable: true },
      { pubkey: SKR_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: adminPDA, isSigner: false, isWritable: false },
    ],
    data: skrData,
  });

  // Construct Transaction with Priority Fee
  const microLamports = parseInt(env.PRIORITY_FEE_MICRO_LAMPORTS || '25000', 10);
  const tx = new Transaction();
  if (microLamports > 0) {
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  }
  tx.add(solIx, skrIx);

  // Snapshot both feeds BEFORE sending so the post-confirmation read-back can
  // prove a strict increase over these exact values (see verifyFeedsAdvanced).
  const [priorSolUpdatedAt, priorSkrUpdatedAt] = await Promise.all([
    readFeedUpdatedAt(connection, solOraclePDA),
    readFeedUpdatedAt(connection, skrOraclePDA),
  ]);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = authority.publicKey;
  tx.sign(authority);

  const rawTx = tx.serialize();
  const signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
  } catch (confirmErr: any) {
    // A confirmation timeout is NOT proof the crank failed.
    //
    // `confirmTransaction` gives up once the block height passes
    // `lastValidBlockHeight`. On a slow or rate-limited RPC that happens
    // routinely for transactions that landed perfectly well. Observed on
    // mainnet 2026-10-09 against a public endpoint: the CLI printed
    // "Signature 24dzVDBu… has expired: block height exceeded" for a
    // transaction that was in fact finalised at slot 454847332 with err=null,
    // having updated both feeds to the exact prices the run had fetched.
    //
    // Throwing here is the mirror of the bug this file already fixed, where an
    // unreadable feed was reported as success. Both destroy the meaning of the
    // exit code: an operator who sees every run fail stops trusting the signal,
    // and may disable the timer that is in fact working.
    //
    // The read-back below is the authority, not the confirmation. If the feeds
    // advanced past where they were before this run, the crank did its job.
    // If it did not land, `verifyFeedsAdvanced` still reports it and the run
    // still fails — so nothing is being waved through.
    console.warn(
      `[Serverless Oracle] Confirmation did not complete (${confirmErr?.message || confirmErr}). ` +
        `Checking whether the transaction landed anyway — the feeds decide.`
    );
  }

  // Confirm the feeds actually advanced. `confirmTransaction` only proves the
  // transaction was finalised, not that the accounts ended up in the state we
  // intended — and it says nothing at all if the read-back is what failed. A
  // crank that silently did not update a feed is indistinguishable from a
  // healthy one until the 600s pricing bound lapses and every borrow reverts,
  // so verify here and fail loudly instead.
  const unverified = await verifyFeedsAdvanced(connection, [
    { pda: solOraclePDA, label: `SOL $${sol}`, priorUpdatedAt: priorSolUpdatedAt },
    { pda: skrOraclePDA, label: `SKR $${skr}`, priorUpdatedAt: priorSkrUpdatedAt },
  ]);
  if (unverified.length > 0) {
    throw new Error(
      `Crank confirmed (${signature}) but these feeds did not advance: ` +
        `${unverified.join(', ')}. Treating the run as failed rather than reporting success.`
    );
  }

  const timestamp = new Date().toISOString();
  console.log(`[Serverless Oracle] Crank succeeded and both feeds verified. Tx: ${signature}`);
  console.log(
    `[Serverless Oracle] Cranked program ${programId.toBase58()} on ${resolveNetwork(env)} ` +
      `(genesis ${genesisHash}) at ${timestamp}`
  );
  lastCrankResult = {
    signature,
    solPrice: sol,
    skrPrice: skr,
    timestamp,
  };
  return {
    success: true,
    signature,
    solPrice: sol,
    skrPrice: skr,
    authority: authority.publicKey.toBase58(),
    timestamp,
  };
}

// Query on-chain PDA health & current price
const REDACTED = 'REDACTED';

/**
 * Strip credential-bearing material before a URL is handed to a caller.
 * `getOracleStatus` backs the unauthenticated `/`, `/health` and `/status` routes,
 * so returning the raw RPC_URL disclosed the provider API key to anyone who asked.
 *
 * Query parameters alone are NOT enough. Providers also put the credential in the
 * PATH (Alchemy `.../v2/<KEY>`, QuickNode `https://<host>/<TOKEN>/`) or in
 * userinfo (`https://user:pass@host`), and both of those forms survived the
 * original param-only scrub in full — the leak only stayed hidden because the
 * documented provider, Helius, happens to use `?api-key=`.
 *
 * The host is kept so operators can still tell which endpoint is in use.
 */
function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username) u.username = REDACTED;
    if (u.password) u.password = REDACTED;
    for (const k of Array.from(u.searchParams.keys())) {
      if (/key|token|secret|auth|pass/i.test(k)) u.searchParams.set(k, REDACTED);
    }
    // Path-embedded credentials. Short segments (`v2`, `rpc`) are structural and
    // kept; anything long enough to be a real secret is replaced wholesale.
    u.pathname = u.pathname
      .split('/')
      .map((seg) => (seg.length >= 16 ? REDACTED : seg))
      .join('/');
    return u.toString();
  } catch {
    return '(unparseable RPC URL)';
  }
}

/**
 * Read each feed back and confirm `last_updated_at` moved forward.
 *
 * Returns the labels of feeds that could not be confirmed. An unreadable feed
 * counts as unconfirmed: absence of evidence is not evidence of a landed write.
 * Retries briefly so a transient RPC blip does not fail an otherwise good crank.
 *
 * PriceFeed layout: 0..8 discriminator, 8 is_initialized, 9..41 mint,
 * 41..49 price (u64 LE), 49 decimals, 50..58 last_updated_at (i64 LE),
 * 58..90 authority, 90..98 max_staleness_seconds.
 */
export async function verifyFeedsAdvanced(
  connection: Connection,
  feeds: Array<{ pda: PublicKey; label: string; priorUpdatedAt: number }>,
  attempts = 3
): Promise<string[]> {
  const unconfirmed: string[] = [];
  for (const { pda, label, priorUpdatedAt } of feeds) {
    let confirmed = false;
    for (let i = 0; i < attempts && !confirmed; i++) {
      try {
        const acc = await connection.getAccountInfo(pda);
        if (acc && acc.data.length >= 58) {
          const updatedAt = Number(acc.data.readBigInt64LE(50));
          // STRICT increase over the value captured BEFORE this crank was sent.
          //
          // This used to compare against `now - 60`, tolerating clock skew. That
          // tolerance also swallowed the exact failure the function exists to
          // catch: when a crank failed to land, the read-back still saw a feed
          // written by a PREVIOUS run inside the last 60 seconds and reported
          // success — a silently stale oracle that only surfaces when the 600s
          // pricing bound lapses and every borrow reverts. A value snapshotted
          // before the send cannot be satisfied by anyone else's write.
          if (updatedAt > priorUpdatedAt) confirmed = true;
        }
      } catch {
        // fall through to the retry
      }
      if (!confirmed && i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    if (!confirmed) unconfirmed.push(label);
  }
  return unconfirmed;
}

/** Read a feed's `last_updated_at`, or 0 when the account is absent/unreadable. */
async function readFeedUpdatedAt(connection: Connection, pda: PublicKey): Promise<number> {
  try {
    const acc = await connection.getAccountInfo(pda);
    if (acc && acc.data.length >= 58) return Number(acc.data.readBigInt64LE(50));
  } catch {
    // Absent reads as 0: a first-ever write must still count as an advance.
  }
  return 0;
}

/**
 * RPC methods the mobile client is allowed to relay through `/rpc`.
 *
 * Whitelisted rather than deny-listed so a new upstream method cannot silently
 * become reachable. This is a cost/abuse control (it stops the proxy being used
 * as a free general-purpose RPC), NOT a security boundary — the endpoints it
 * forwards to are public blockchain state.
 *
 * `sendTransaction` is included because the client signs locally and submits
 * here. It cannot be used to move anyone else's funds: the transaction still
 * has to carry a valid signature.
 */
const ALLOWED_RPC_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getGenesisHash',
  'getHealth',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getRecentPrioritizationFees',
  'getSignatureStatuses',
  'getSlot',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTransaction',
  'getVersion',
  'isBlockhashValid',
  'sendTransaction',
  'simulateTransaction',
]);

/**
 * Caps that bound what a single anonymous request can cost.
 *
 * These exist because `/rpc` has no rate limiting behind it: without them one
 * request could carry an unbounded call array, or a body up to the platform cap
 * (~100MB on non-Enterprise plans), straight to the paid upstream endpoint.
 */
const MAX_RPC_BATCH = 10;
const MAX_RPC_BODY_BYTES = 8 * 1024;

/**
 * Per-isolate cache for the unauthenticated status routes.
 *
 * `/`, `/health` and `/status` share one handler that fans out to two BILLED
 * upstream calls (`getGenesisHash` + `getMultipleAccountsInfo`) per request.
 * With no rate limiting behind them, a trivial loop of GETs drains the same paid
 * quota as hammering the /rpc relay, without needing to speak JSON-RPC at all.
 *
 * 20s is deliberately far inside both the 600s on-chain pricing bound and the
 * 540s staleness alert, so a slightly-stale answer cannot mask a real problem.
 */
const STATUS_CACHE_MS = 20_000;
let statusCache: { at: number; value: Awaited<ReturnType<typeof getOracleStatus>> } | null = null;

/** Small JSON responder. Never includes upstream URLs (they carry API keys). */
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Constant-time string comparison for shared secrets.
 *
 * `===` on strings short-circuits at the first differing byte, leaking the
 * length of the shared prefix through timing. Over the internet that is a noisy
 * channel — every guess costs a full round trip — but this token is the ONLY
 * thing guarding an endpoint that spends the oracle authority's lamports and
 * writes global protocol prices, so it is worth closing rather than arguing
 * about exploitability.
 *
 * Both sides are SHA-256'd first: `timingSafeEqual` requires equal-length
 * inputs, and hashing also keeps the real length out of the comparison.
 */
async function secretEquals(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/**
 * Sanitise an error message before returning it to an anonymous caller.
 * @solana/web3.js and fetch errors routinely embed the endpoint URL, including
 * its credential, so raw `err.message` must not be echoed.
 *
 * This must stay AT LEAST as strong as `redactUrl` — the two disagreed, and this
 * one was the weaker of the pair: it required an `api-?key`-style parameter
 * NAME, so a bare `?key=`, a path-embedded credential (`.../v2/<KEY>`) or
 * userinfo all passed straight through into the response, on every error path.
 */
function safeErrorMessage(err: any): string {
  const raw = String(err?.message ?? err);
  // Anything URL-shaped in the message gets the full URL treatment (userinfo,
  // path segments and query parameters alike).
  const urlsScrubbed = raw.replace(/https?:\/\/[^\s"'<>)]+/gi, (m) => redactUrl(m));
  // Belt for credential params appearing in free text that is not a parseable URL.
  return urlsScrubbed.replace(
    /([?&][A-Za-z0-9_-]*(?:key|token|secret|auth|pass)[A-Za-z0-9_-]*=)[^&\s"']+/gi,
    `$1${REDACTED}`
  );
}

export async function getOracleStatus(env: Env) {
  const programId = new PublicKey(env.PROGRAM_ID || DEFAULT_PROGRAM_ID);
  const rpcUrl = resolveRpcUrl(env);
  const connection = new Connection(rpcUrl, 'confirmed');
  const network = resolveNetwork(env);
  const genesisHash = await connection.getGenesisHash().catch(() => null);

  const [solOraclePDA] = PublicKey.findProgramAddressSync([ORACLE_SEED, NATIVE_SOL_MINT.toBuffer()], programId);
  const [skrOraclePDA] = PublicKey.findProgramAddressSync([ORACLE_SEED, SKR_MINT.toBuffer()], programId);

  const accounts = await connection.getMultipleAccountsInfo([solOraclePDA, skrOraclePDA], 'confirmed');

  function unpack(data: Buffer | null, defaultDecimals: number) {
    if (!data || data.length < 98) return null;
    const discriminator = data.subarray(0, 8).toString();
    if (discriminator !== 'CLK_FEED') return null;
    const isInitialized = data[8] === 1;
    if (!isInitialized) return null;

    const mint = new PublicKey(data.subarray(9, 41)).toBase58();
    const priceMicro = data.readBigUInt64LE(41);
    const decimals = data[49] || defaultDecimals;
    const lastUpdated = Number(data.readBigInt64LE(50));
    const authority = new PublicKey(data.subarray(58, 90)).toBase58();
    const maxStaleness = Number(data.readBigInt64LE(90));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds = Math.max(0, nowSeconds - lastUpdated);
    const dateStr = lastUpdated > 0 ? new Date(lastUpdated * 1000).toISOString() : 'never';

    return {
      isInitialized,
      mint,
      priceUsd: Number(priceMicro) / 1e6,
      decimals,
      lastUpdated: dateStr,
      ageSeconds,
      authority,
      // Stored window (3600s) is retained for monitoring only; the program caps
      // admin-feed pricing at 600s regardless (see processor.rs round-11 note).
      maxStalenessSeconds: maxStaleness,
      priceAgeLimitSeconds: ONCHAIN_PRICE_AGE_LIMIT_SECONDS,
      isFresh: ageSeconds < ONCHAIN_PRICE_AGE_LIMIT_SECONDS,
      shouldAlert: ageSeconds >= STALENESS_ALERT_SECONDS,
    };
  }

  const solFeed = unpack(accounts[0]?.data ? Buffer.from(accounts[0].data) : null, 9);
  const skrFeed = unpack(accounts[1]?.data ? Buffer.from(accounts[1].data) : null, 6);
  const feeds = { sol: solFeed, skr: skrFeed };
  const staleFeeds: string[] = [];
  if (!solFeed) staleFeeds.push('sol:missing');
  else if (solFeed.shouldAlert) staleFeeds.push(`sol:${solFeed.ageSeconds}s`);
  if (!skrFeed) staleFeeds.push('skr:missing');
  else if (skrFeed.shouldAlert) staleFeeds.push(`skr:${skrFeed.ageSeconds}s`);

  const ages = [solFeed?.ageSeconds, skrFeed?.ageSeconds].filter(
    (a): a is number => typeof a === 'number'
  );

  return {
    programId: programId.toBase58(),
    expectedProgramId: TARGET_PROGRAM_ID,
    programIdMatchesTarget: programId.toBase58() === TARGET_PROGRAM_ID,
    network,
    genesisHash,
    genesisMatchesNetwork: genesisHash === GENESIS_HASHES[network],
    rpcUrl: redactUrl(rpcUrl),
    solFeed,
    skrFeed,
    oldestFeedAgeSeconds: ages.length ? Math.max(...ages) : null,
    stalenessAlertThresholdSeconds: STALENESS_ALERT_SECONDS,
    staleFeeds,
    healthy: staleFeeds.length === 0,
    lastCrank: lastCrankResult,
  };
}

// Cloudflare Workers Default Export
export default {
  // 1. Scheduled Cron Event (e.g. every 3 minutes)
  async scheduled(_event: any, env: Env, ctx: any): Promise<void> {
    ctx.waitUntil(
      crankOracles(env).catch((err) => {
        console.error('[Serverless Oracle Cron Failed]:', err.message || err);
      })
    );
  },

  // 2. HTTP Request Handler (Health, Status, and Manual Trigger)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── RPC proxy ──────────────────────────────────────────────────────────
    //
    // The mobile client needs a paid RPC endpoint, but ANYTHING shipped in an
    // app bundle is public: `EXPO_PUBLIC_*` variables are inlined into the JS at
    // build time, and Hermes bytecode is trivially `strings`-able. So the API
    // key lives HERE, in the Worker's secret store (`wrangler secret put
    // RPC_URL`), and the app is configured with this Worker's URL instead.
    //
    // The method whitelist matters: without it this is an open relay that lets
    // anyone spend the protocol's paid RPC quota. It is a cost/abuse control,
    // not a security boundary.
    //
    // What this handler ACTUALLY enforces: a method allowlist, a batch-depth cap
    // and a body-size cap. It does not rate limit — no Rate Limiting rule is
    // configured for this Worker, and a Worker cannot apply one by itself (there
    // is no Durable Object binding in wrangler.toml). Adding an edge rate-limit
    // rule on this path is still an operator task; the caps below are what bound
    // a single request in the meantime.
    if (url.pathname === '/rpc') {
      if (request.method !== 'POST') {
        return json({ error: 'POST only' }, 405);
      }
      const upstream = (env.RPC_URL || '').trim();
      if (!upstream) {
        return json({ error: 'RPC_URL is not configured on this Worker' }, 503);
      }

      // Reject non-JSON content types. A cross-site fetch with a "simple" type
      // (text/plain) is never preflighted, so without this any page could drive
      // this endpoint blind.
      const contentType = (request.headers.get('content-type') || '').split(';')[0].trim();
      if (contentType !== 'application/json') {
        return json({ error: 'content-type must be application/json' }, 415);
      }

      // Bound the body BEFORE parsing it. The declared length is a cheap early
      // reject; the real length is checked as well because the header can be
      // absent (chunked) or simply lie.
      const declared = Number(request.headers.get('content-length') || '0');
      if (declared > MAX_RPC_BODY_BYTES) {
        return json({ error: 'request body too large' }, 413);
      }
      let rawBody: string;
      try {
        rawBody = await request.text();
      } catch {
        return json({ error: 'unreadable request body' }, 400);
      }
      if (rawBody.length > MAX_RPC_BODY_BYTES) {
        return json({ error: 'request body too large' }, 413);
      }

      let body: any;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }

      // Batch requests carry an array; validate every method in it AND cap the
      // depth. The methods were always allowlisted, but the array length was
      // unbounded — so one request could carry an arbitrary number of calls
      // straight to the paid upstream in a single subrequest.
      const calls = Array.isArray(body) ? body : [body];
      if (calls.length > MAX_RPC_BATCH) {
        return json({ error: `batch too large (max ${MAX_RPC_BATCH})` }, 413);
      }
      for (const call of calls) {
        if (!call || typeof call.method !== 'string' || !ALLOWED_RPC_METHODS.has(call.method)) {
          return json(
            { error: `RPC method not allowed through this proxy: ${String(call?.method)}` },
            403
          );
        }
      }

      try {
        const upstreamRes = await fetch(upstream, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        // Pass the upstream status and body through unchanged so the client's
        // existing error handling keeps working.
        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          headers: { 'content-type': 'application/json' },
        });
      } catch (err: any) {
        // Never echo the upstream URL — it carries the API key.
        return json({ error: safeErrorMessage(err) }, 502);
      }
    }

    // Health / Status endpoint
    if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/status') {
      try {
        // Served from the short-lived per-isolate cache when warm, so repeated
        // anonymous GETs do not each cost two billed upstream calls.
        const nowMs = Date.now();
        if (!statusCache || nowMs - statusCache.at >= STATUS_CACHE_MS) {
          statusCache = { at: nowMs, value: await getOracleStatus(env) };
        }
        const status = statusCache.value;

        // Staleness alert: log loudly when any feed is approaching the on-chain
        // 600s pricing cliff. Alerting at 540s leaves a usable margin to react.
        if (status.staleFeeds.length > 0) {
          console.error(
            `[Serverless Oracle ALERT] STALE PRICE FEEDS on ${status.network} program ${status.programId}: ` +
              `${status.staleFeeds.join(', ')} (threshold ${STALENESS_ALERT_SECONDS}s, ` +
              `on-chain limit ${ONCHAIN_PRICE_AGE_LIMIT_SECONDS}s). ` +
              `Borrow/liquidation paths will revert with StaleOraclePrice once ${ONCHAIN_PRICE_AGE_LIMIT_SECONDS}s elapse. ` +
              `Check the cron trigger and the ORACLE_KEYPAIR authority.`
          );
        }
        if (!status.programIdMatchesTarget) {
          console.error(
            `[Serverless Oracle ALERT] PROGRAM_ID ${status.programId} is not the expected ` +
              `mainnet deployment ${TARGET_PROGRAM_ID}.`
          );
        }
        if (!status.genesisMatchesNetwork) {
          console.error(
            `[Serverless Oracle ALERT] RPC endpoint genesis ${status.genesisHash} does not match ` +
              `NETWORK=${status.network} — cranks will refuse to sign.`
          );
        }

        return new Response(JSON.stringify(status, null, 2), {
          status: status.healthy ? 200 : 503,
          headers: { 'content-type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: safeErrorMessage(err) }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    // Manual on-demand crank endpoint (POST /crank)
    if (url.pathname === '/crank' && request.method === 'POST') {
      // FAIL CLOSED. This endpoint spends the oracle authority's lamports and
      // writes global protocol prices, so an unauthenticated /crank is a griefing
      // vector. If no token is configured we refuse the request outright rather
      // than silently running unauthenticated.
      if (!env.CRANK_AUTH_TOKEN) {
        return new Response(
          JSON.stringify({
            error: 'Crank endpoint disabled: CRANK_AUTH_TOKEN is not configured.',
            remedy: 'Set the secret with `npx wrangler secret put CRANK_AUTH_TOKEN` and redeploy.',
            docs: 'serverless/README.md',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        );
      }

      const authHeader = request.headers.get('authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      // Constant-time (see secretEquals). The 503 above already guarantees the
      // configured token is non-empty, so an empty/short guess cannot match.
      if (!(await secretEquals(token, env.CRANK_AUTH_TOKEN))) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      try {
        const result = await crankOracles(env);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'content-type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: safeErrorMessage(err) }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
