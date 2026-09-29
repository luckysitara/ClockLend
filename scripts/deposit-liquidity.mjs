// ClockLend pool liquidity deposit (instruction tag 1, DepositLiquidity).
//
// The program restricts deposits to the pool AUTHORITY (no LP-share
// accounting — the pool is the authority's own lending book). This script
// signs as the deployer/authority key and moves USDC from its ATA into the
// pool vault.
//
// Round-14 hardening (same rules as withdraw-treasury):
//   * getGenesisHash is verified against the intended cluster before signing.
//   * --dry-run builds and simulates; --yes is required to send on mainnet.
//   * --status prints pool + vault + wallet balances read-only.
import fs from 'fs';
import { assertCluster, normalizeCluster, GENESIS_HASHES } from './lib/cluster-guard.mjs';

let web3;
try {
  web3 = await import('@solana/web3.js');
} catch (_e) {
  try {
    web3 = await import('../serverless/node_modules/@solana/web3.js/lib/index.cjs.js');
  } catch (_e2) {
    web3 = await import('../mobile/node_modules/@solana/web3.js/lib/index.cjs.js');
  }
}
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = web3;

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const POOL_SEED = Buffer.from('pool');
const VAULT_SEED = Buffer.from('vault');

// Mainnet pool #1 (Circle) — authority 8YvdDpW…, USDC liquidity.
const DEFAULT_POOL = '4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu';
const DEFAULT_AUTHORITY = '8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds';

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const readFlag = (name) => {
  const eqForm = args.find((a) => a.startsWith(`${name}=`));
  if (eqForm) return { found: true, value: eqForm.slice(name.length + 1) || null };
  const i = args.indexOf(name);
  if (i === -1) return { found: false, value: null };
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) return { found: true, value: null };
  return { found: true, value };
};

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.log('Usage:');
  console.log('  # Check pool + wallet balances (read-only):');
  console.log('  node scripts/deposit-liquidity.mjs --cluster mainnet-beta --status');
  console.log('\n  # Deposit USDC into the pool:');
  console.log('  node scripts/deposit-liquidity.mjs --cluster mainnet-beta \\');
  console.log('       --amount 50 [--pool <POOL_ADDRESS>] [--dry-run] [--yes]');
  console.log('\n  --cluster  REQUIRED. Verified against getGenesisHash before signing.');
  console.log('  --amount   USDC to deposit (human units). REQUIRED unless --status.');
  console.log('  --pool     Pool address. Defaults to mainnet pool #1 (Circle).');
  console.log('  --dry-run  Build and simulate; never send.');
  console.log('  --yes      Required to actually send on mainnet-beta.');
  process.exit(1);
}

const rawCluster = readFlag('--cluster').value || process.env.NETWORK;
if (!rawCluster) usage('--cluster is required (mainnet-beta or devnet).');
const network = normalizeCluster(rawCluster);
if (!GENESIS_HASHES[network]) usage(`unknown cluster "${rawCluster}" (expected mainnet-beta or devnet).`);
const isMainnet = network === 'mainnet-beta';

const statusOnly = has('--status');
const dryRun = has('--dry-run');
const confirmed = has('--yes');

const RPC_URL = process.env.RPC_URL || (isMainnet
  ? (process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com')
  : (process.env.DEVNET_RPC || 'https://api.devnet.solana.com'));

const conn = new Connection(RPC_URL, 'confirmed');

const poolAddress = readFlag('--pool').value || DEFAULT_POOL;
const poolKey = new PublicKey(poolAddress);
const [vaultKey] = PublicKey.findProgramAddressSync(
  [VAULT_SEED, poolKey.toBuffer()],
  PROGRAM_ID
);

const amountFlag = readFlag('--amount').value;
if (!statusOnly && !amountFlag) usage('--amount is required (USDC, human units).');
const amountUsdc = amountFlag ? parseFloat(amountFlag) : 0;
if (!statusOnly && (!Number.isFinite(amountUsdc) || amountUsdc <= 0)) {
  usage(`--amount "${amountFlag}" is not a positive number`);
}
const amountMicro = BigInt(Math.round(amountUsdc * 1_000_000));

function loadEnv() {
  const envPath = new URL('../.env', import.meta.url).pathname;
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();
if (!RPC_URL.includes('mainnet') && isMainnet) {
  console.warn('WARNING: --cluster mainnet-beta but RPC_URL does not look like mainnet. Refusing.');
  process.exit(1);
}

const keypairPath = process.env.AUTHORITY_KEY || `${process.env.HOME}/.config/solana/mainnet-deployer.json`;
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
);

const [authorityUsdcAta] = PublicKey.findProgramAddressSync(
  [authority.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MAINNET_MINT.toBuffer()],
  ATOKEN_PROGRAM_ID
);

async function showStatus() {
  console.log(`Network:   ${network}`);
  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  console.log(`Pool:      ${poolKey.toBase58()}`);
  console.log(`Vault:     ${vaultKey.toBase58()}`);
  console.log(`ATA:       ${authorityUsdcAta.toBase58()}`);
  const bal = async (pk) => {
    try {
      const acc = await conn.getParsedAccountInfo(pk);
      const info = acc.value?.data?.parsed?.info;
      return info ? `${info.tokenAmount.uiAmountString} USDC` : '(none)';
    } catch (_e) {
      return '(unavailable)';
    }
  };
  console.log(`Wallet:    ${await bal(authorityUsdcAta)}`);
  console.log(`Vault:     ${await bal(vaultKey)}`);
}

async function main() {
  await assertCluster(conn, network);
  console.log(`Genesis OK (${network})`);

  if (statusOnly) {
    await showStatus();
    return;
  }

  // Fail closed BEFORE signing: the pool must be a real initialized pool whose
  // authority is this key and whose liquidity mint is USDC.
  const poolAcc = await conn.getAccountInfo(poolKey);
  if (!poolAcc) throw new Error(`Pool ${poolKey.toBase58()} does not exist on ${network}.`);
  if (poolAcc.owner.toBase58() !== PROGRAM_ID.toBase58()) {
    throw new Error('Pool account is not owned by the ClockLend program.');
  }
  const poolData = poolAcc.data;
  const discriminator = Buffer.from(poolData.subarray(0, 8)).toString('ascii');
  if (discriminator !== 'CLK_POOL') throw new Error('Pool discriminator mismatch (not a CLK_POOL).');
  // Borsh layout: discriminator 0..8, is_initialized 8..9, pool_id 9..17,
  // pool_type 17..18, authority 18..50 (state.rs LendingPool::LEN = 200).
  const packedAuthority = new PublicKey(poolData.subarray(18, 50));
  if (packedAuthority.toBase58() !== authority.publicKey.toBase58()) {
    throw new Error(
      `This key (${authority.publicKey.toBase58()}) is NOT the pool authority ` +
      `(${packedAuthority.toBase58()}) — the program restricts deposits to the pool authority.`
    );
  }

  console.log(`Depositing ${amountUsdc} USDC into pool ${poolKey.toBase58()} (vault ${vaultKey.toBase58()})`);

  // Wire tag 1 (DepositLiquidity), data = u64 LE amount. Accounts:
  // 0 authority (signer), 1 pool, 2 authority USDC ATA, 3 vault, 4 token program.
  const data = Buffer.alloc(1 + 8);
  data[0] = 1;
  data.writeBigUInt64LE(amountMicro, 1);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: poolKey, isSigner: false, isWritable: true },
      { pubkey: authorityUsdcAta, isSigner: false, isWritable: true },
      { pubkey: vaultKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;
  const blockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
  tx.recentBlockhash = blockhash;

  if (dryRun) {
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
    console.log(`Dry-run OK (${sim.value.unitsConsumed} CU). Not sent.`);
    return;
  }

  if (isMainnet && !confirmed) {
    throw new Error('Mainnet send requires --yes.');
  }

  const sig = await sendAndConfirmTransaction(conn, tx, [authority], { commitment: 'confirmed' });
  console.log(`Deposited ${amountUsdc} USDC. Signature: ${sig}`);
  await showStatus();
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
