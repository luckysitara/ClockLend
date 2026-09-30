import fs from 'fs';
import { pathToFileURL } from 'url';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  SystemProgram, SYSVAR_CLOCK_PUBKEY, sendAndConfirmTransaction,
} from '@solana/web3.js';
import { assertCluster, normalizeCluster, GENESIS_HASHES } from '../../scripts/lib/cluster-guard.mjs';

// Load the repo-root .env (no external deps) so server-side scripts can use
// SOLANA_RPC_URL / HELIUS_RPC_URL without exporting them manually.
function loadEnv() {
  // Try the repo-root .env first (server keys), then the app's mobile/.env
  let envPath = new URL('../../.env', import.meta.url).pathname;
  if (!fs.existsSync(envPath)) envPath = new URL('../.env', import.meta.url).pathname;
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch (_e) { /* optional */ }
}
loadEnv();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7');
const SKR_MINT = new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const ORACLE_SEED = Buffer.from('oracle');
const ADMIN_SEED = Buffer.from('admin');

// The program caps admin-feed pricing at 600s regardless of the stored window
// (processor.rs: feed.max_staleness_seconds.min(ADMIN_FEED_MAX_PRICE_AGE_SECS)).
const ONCHAIN_PRICE_AGE_LIMIT_SECONDS = 600;

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
// Accept --network or --cluster; both mean the same thing.
const network = normalizeCluster(readFlag('--network', readFlag('--cluster', process.env.NETWORK || 'mainnet-beta')));
const skrPrice = parseFloat(readFlag('--skr-price', '0'));
const solPriceOverride = parseFloat(readFlag('--sol-price', '0'));

const RPC = network === 'devnet'
  ? (process.env.DEVNET_RPC || 'https://api.devnet.solana.com')
  : (process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');
// After --rotate-oracle, feeds are signed by the keeper key (the rotated
// oracle_authority), never by the full admin/upgrade key.
const keypairPath = process.env.KEEPER_KEY || process.env.ORACLE_KEY || `${process.env.HOME}/.config/solana/mainnet-keeper.json`;
const conn = new Connection(RPC, 'confirmed');

// Loaded lazily: reading the keypair at import time made this module
// unimportable (and therefore untestable) on any machine without the key, and
// threw before any argument validation or usage message could run.
let _keypair = null;
function getKeypair() {
  if (_keypair) return _keypair;
  let raw;
  try {
    raw = fs.readFileSync(keypairPath, 'utf8');
  } catch (e) {
    throw new Error(
      `Cannot read the keeper keypair at ${keypairPath} (${e.code || e.message}).\n` +
        'Set KEEPER_KEY=/path/to/keypair.json or place it at the default location.'
    );
  }
  try {
    _keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
  } catch (e) {
    throw new Error(`Keypair at ${keypairPath} is not a valid JSON secret-key array: ${e.message}`);
  }
  return _keypair;
}

const w64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

// Decode a PriceFeed PDA. Layout (98 bytes):
//   0..8   'CLK_FEED' discriminator
//   8      is_initialized
//   9..41  mint
//   41..49 price (u64 LE, micro-USD)
//   49     decimals
//   50..58 last_updated_at (i64 LE, unix seconds)
//   58..90 authority
//   90..98 max_staleness_seconds (i64 LE)
function unpackFeed(data) {
  const d = Buffer.from(data);
  if (d.length < 98 || d.subarray(0, 8).toString() !== 'CLK_FEED') return null;
  return {
    isInitialized: d[8] === 1,
    priceMicro: d.readBigUInt64LE(41),
    decimals: d[49] || null,
    lastUpdatedAt: Number(d.readBigInt64LE(50)),
    authority: new PublicKey(d.subarray(58, 90)).toBase58(),
    maxStalenessSeconds: Number(d.readBigInt64LE(90)),
  };
}

/** Read the feed and report how stale it was BEFORE this run. */
async function readFeedState(oraclePda) {
  try {
    const acc = await conn.getAccountInfo(oraclePda);
    if (!acc) return { exists: false };
    const feed = unpackFeed(acc.data);
    if (!feed) return { exists: true, decodable: false };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds = feed.lastUpdatedAt > 0 ? Math.max(0, nowSeconds - feed.lastUpdatedAt) : null;
    return {
      exists: true,
      decodable: true,
      ...feed,
      ageSeconds,
      // Whether the feed was already past the on-chain 600s pricing cliff.
      wasStale: ageSeconds === null || ageSeconds > ONCHAIN_PRICE_AGE_LIMIT_SECONDS,
    };
  } catch (e) {
    return { exists: false, readError: e.message || String(e) };
  }
}

/**
 * Read a feed for post-update verification, retrying briefly.
 *
 * Verification must not be fooled by a transient RPC error (429, timeout): a
 * single failed read used to be indistinguishable from "the update worked", so
 * the keeper reported success for cranks it never confirmed. Retry, then let
 * the caller fail closed.
 */
async function readFeedStateVerified(oraclePda, attempts = 3) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    last = await readFeedState(oraclePda);
    if (last.exists && last.decodable) return last;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return last;
}

/**
 * Decide the outcome of a post-update verification read.
 *
 * Pulled out as a pure function so the fail-closed rules are unit-testable
 * without a network: a write we cannot CONFIRM is a failure, not a success.
 *   - 'unverified' : the read failed or the account is not a decodable feed
 *   - 'stale'      : the feed is readable but still past the on-chain bound
 *   - 'ok'         : readable and inside the bound
 */
export function classifyPostUpdate(after) {
  if (!after || !after.exists || !after.decodable || after.ageSeconds === null || after.ageSeconds === undefined) {
    return 'unverified';
  }
  return after.ageSeconds > ONCHAIN_PRICE_AGE_LIMIT_SECONDS ? 'stale' : 'ok';
}

function describeStaleness(label, state) {
  if (!state.exists) return `${label}: feed account does not exist yet (first crank will create it)`;
  if (state.readError) return `${label}: could not read feed (${state.readError})`;
  if (!state.decodable) return `${label}: feed account present but not a decodable CLK_FEED`;
  const age = state.ageSeconds === null ? 'never updated' : `${state.ageSeconds}s old`;
  const verdict = state.wasStale ? 'STALE (past the 600s on-chain pricing limit)' : 'fresh';
  return `${label}: ${age} — ${verdict} (authority ${state.authority}, stored window ${state.maxStalenessSeconds}s)`;
}

async function main() {
  const [adminPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], PROGRAM_ID);

  console.log(`=== ClockLend keeper ===`);
  console.log(`network:    ${network}`);
  console.log(`rpc:        ${RPC}`);
  console.log(`program:    ${PROGRAM_ID.toBase58()}`);
  console.log(`signer:     ${getKeypair().publicKey.toBase58()}`);
  const genesis = await assertCluster(conn, network);
  console.log(`genesis:    ${genesis} (matches ${network})`);

  // Declared before the target list so a missing price source can be recorded
  // as a failure rather than logged and forgotten.
  const failures = [];

  const targets = [];
  const solUsd = solPriceOverride > 0
    ? solPriceOverride
    : await fetchJupUsdPrice(NATIVE_MINT.toBase58()).catch(() => fetchUsdPrice('solana'));
  targets.push({ mint: NATIVE_MINT, priceMicroUsd: Math.round(solUsd * 1e6), decimals: 9, label: `SOL $${solUsd}` });

  // SKR is listed on Jupiter (jup.ag/tokens/SKRbvo6Gf…); default to the live
  // market price unless --skr-price is passed as a manual override.
  if (skrPrice > 0 || network === 'mainnet-beta') {
    const skrUsd = skrPrice > 0
      ? skrPrice
      : await fetchJupUsdPrice(SKR_MINT.toBase58()).catch(() => 0);
    if (skrUsd > 0) {
      targets.push({ mint: SKR_MINT, priceMicroUsd: Math.round(skrUsd * 1e6), decimals: 6, label: `SKR $${skrUsd}` });
    } else {
      // Previously this was logged and ignored, so the SKR feed could drift past
      // the 600s on-chain pricing bound while the keeper still exited 0 and
      // printed success. On mainnet the SKR feed is a required target.
      console.error('  FAILED SKR: no price from Jupiter or the CoinGecko fallback — feed NOT updated.');
      failures.push('SKR (no price source)');
    }
  }

  for (const t of targets) {
    const [oraclePda] = PublicKey.findProgramAddressSync([ORACLE_SEED, t.mint.toBuffer()], PROGRAM_ID);
    const before = await readFeedState(oraclePda);
    console.log(`  pre-update ${describeStaleness(t.label, before)}`);

    const ok = await setFeed(oraclePda, t.mint, t.priceMicroUsd, t.decimals, adminPda, t.label);
    if (!ok) {
      failures.push(t.label);
      continue;
    }

    const after = await readFeedStateVerified(oraclePda);
    const outcome = classifyPostUpdate(after);
    if (outcome === 'unverified') {
      // Cannot confirm the write. Previously this fell through to the success
      // branch, so an RPC failure during the post-check was reported as a
      // successful crank and the process exited 0. Absence of evidence is not
      // evidence of a landed update: fail closed.
      console.error(
        `  UNVERIFIED ${t.label}: write not confirmed after retries` +
          (after?.readError ? ` (${after.readError})` : '') +
          ' — treating as failure so the run exits non-zero and alerts.'
      );
      failures.push(t.label);
    } else if (outcome === 'stale') {
      // The transaction confirmed but the account did not change as expected —
      // treat that as a failed update rather than reporting success.
      console.error(`  FAILED ${t.label}: post-update age is still ${after.ageSeconds}s — feed did not advance.`);
      failures.push(t.label);
    } else {
      console.log(`  post-update ${describeStaleness(t.label, after)}`);
    }
  }

  console.log(`${new Date().toISOString()} keeper run complete (${network})`);

  if (failures.length > 0) {
    console.error(`\nFAILED: ${failures.length} feed update(s) did not succeed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`All ${targets.length} feed update(s) succeeded.`);
}

async function setFeed(oraclePda, mint, priceMicroUsd, decimals, adminPda, label) {
  const data = Buffer.concat([Buffer.from([12]), w64(priceMicroUsd), Buffer.from([decimals])]);
  try {
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: getKeypair().publicKey, isSigner: true, isWritable: true }, // writable: first-time feed creation pays rent
        { pubkey: oraclePda, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: adminPda, isSigner: false, isWritable: false },
      ],
      data,
    })), [getKeypair()], { commitment: 'confirmed' });
    console.log(`  feed updated (${label}): ${sig}`);
    return true;
  } catch (e) {
    console.error(`  FAILED to update ${label}: ${e.message}`);
    return false;
  }
}

async function fetchJupUsdPrice(mint) {
  const base = (process.env.JUPITER_API_URL || 'https://api.jup.ag').replace(/\/+$/, '');
  const headers = process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {};
  const res = await fetch(`${base}/price/v3?ids=${mint}`, { headers });
  if (!res.ok) throw new Error(`Jupiter price failed: ${res.status}`);
  const j = await res.json();
  const usd = j?.[mint]?.usdPrice;
  if (!usd) throw new Error(`No Jupiter price for ${mint}`);
  return Number(usd);
}

async function fetchUsdPrice(coingeckoId) {
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`);
  if (!res.ok) throw new Error(`CoinGecko failed: ${res.status}`);
  const j = await res.json();
  const price = j[coingeckoId]?.usd;
  if (!price) throw new Error(`No price for ${coingeckoId}`);
  return price;
}

// Only run when executed directly, so the module can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
