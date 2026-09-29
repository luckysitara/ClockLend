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
  return raw === 'devnet' || raw === 'testnet' ? 'devnet' : 'mainnet-beta';
}

function resolveRpcUrl(env: Env): string {
  if (env.RPC_URL && env.RPC_URL.trim()) return env.RPC_URL.trim();
  return resolveNetwork(env) === 'devnet' ? DEVNET_RPC_FALLBACK : MAINNET_RPC_FALLBACK;
}

/** Fail closed if the RPC endpoint is not the cluster we intend to sign for. */
async function assertExpectedCluster(connection: Connection, env: Env): Promise<string> {
  const network = resolveNetwork(env);
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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = authority.publicKey;
  tx.sign(authority);

  const rawTx = tx.serialize();
  const signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  const timestamp = new Date().toISOString();
  console.log(`[Serverless Oracle] Crank succeeded. Tx: ${signature}`);
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
    rpcUrl,
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

    // Health / Status endpoint
    if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/status') {
      try {
        const status = await getOracleStatus(env);

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
        return new Response(JSON.stringify({ error: err.message }), {
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
      if (token !== env.CRANK_AUTH_TOKEN) {
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
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
