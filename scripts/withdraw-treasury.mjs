// ClockLend treasury profit withdrawal (instruction tag 14, WithdrawTreasury).
//
// Round-14 hardening:
//   * --amount parse failures are reported as USAGE errors with a clear message
//     instead of surfacing a raw `RangeError: The number NaN cannot be converted
//     to a BigInt` from deep inside BigInt().
//   * On mainnet-beta, --dest is REQUIRED. Previously it silently defaulted to
//     the admin key, so a typo'd command moved real protocol revenue into the
//     hot deployer wallet instead of the intended cold destination.
//   * --dry-run builds and simulates; --yes is required to send on mainnet.
//   * getGenesisHash is verified against the intended cluster before signing.
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
  SystemProgram,
  sendAndConfirmTransaction,
} = web3;

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const ADMIN_SEED = Buffer.from('admin');
const TREASURY_SEED = Buffer.from('treasury');

// Token Mints
const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
// Accepts both `--name value` and `--name=value`.
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
  console.log('  # Check Treasury Balances:');
  console.log('  node scripts/withdraw-treasury.mjs --cluster <mainnet-beta|devnet> --status');
  console.log('\n  # Withdraw USDC Profit:');
  console.log('  node scripts/withdraw-treasury.mjs --cluster mainnet-beta \\');
  console.log('       --amount 50 --token usdc --dest <DESTINATION_WALLET> [--dry-run] [--yes]');
  console.log('\n  # Withdraw SOL Profit:');
  console.log('  node scripts/withdraw-treasury.mjs --cluster mainnet-beta \\');
  console.log('       --amount 1.5 --token sol --dest <DESTINATION_WALLET> [--dry-run] [--yes]');
  console.log('\n  --cluster  REQUIRED. Verified against getGenesisHash before signing.');
  console.log('  --dest     REQUIRED on mainnet-beta (no default destination).');
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

// Admin Keypair
const adminKeyPath = isMainnet
  ? (process.env.DEPLOYER_KEY || `${process.env.HOME}/.config/solana/mainnet-deployer.json`)
  : (process.env.ADMIN_KEY || `${process.env.HOME}/.config/solana/id.json`);

if (!fs.existsSync(adminKeyPath)) {
  console.error(`Admin keypair not found at: ${adminKeyPath}`);
  process.exit(1);
}

const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(adminKeyPath, 'utf8')))
);

function writeU64LE(val) {
  const buf = Buffer.alloc(8);
  const big = BigInt(val);
  buf.writeUInt32LE(Number(big & 0xffffffffn), 0);
  buf.writeUInt32LE(Number((big >> 32n) & 0xffffffffn), 4);
  return buf;
}

function getAta(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATOKEN_PROGRAM_ID
  )[0];
}

async function main() {
  const [adminPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], PROGRAM_ID);
  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID);

  console.log('=== ClockLend Treasury Profit Withdrawal ===');
  console.log('Cluster:', network);
  console.log('RPC:', RPC_URL);
  console.log('Admin Signer:', adminKeypair.publicKey.toBase58());
  console.log('Treasury PDA:', treasuryPda.toBase58());

  const genesis = await assertCluster(conn, network);
  console.log('Genesis:', genesis, `(matches ${network})`);

  // Check Treasury Balances
  const solLamports = await conn.getBalance(treasuryPda);
  console.log(`Treasury Native SOL Balance: ${(solLamports / 1e9).toFixed(5)} SOL`);
  if (solLamports === 0 && !statusOnly) {
    console.log('  (note: a 0 SOL balance usually means the Treasury PDA account has never been');
    console.log('   initialized — the program only creates it via DepositTreasury.)');
  }

  const usdcMint = isMainnet ? USDC_MAINNET_MINT : USDC_DEVNET_MINT;
  const treasuryUsdcAta = getAta(treasuryPda, usdcMint);

  let usdcBalance = null;
  try {
    const res = await conn.getTokenAccountBalance(treasuryUsdcAta);
    usdcBalance = res.value.uiAmount ?? Number(res.value.amount) / 10 ** res.value.decimals;
    console.log(`Treasury USDC ATA Balance: $${usdcBalance.toFixed(2)} USDC (${treasuryUsdcAta.toBase58()})`);
  } catch (_) {
    console.log(`Treasury USDC ATA not initialized yet (${treasuryUsdcAta.toBase58()})`);
  }

  if (statusOnly) return;

  // ---- Parse the withdrawal request -------------------------------------
  const amountFlag = readFlag('--amount');
  const tokenType = (readFlag('--token').value || 'usdc').toLowerCase();
  if (tokenType !== 'usdc' && tokenType !== 'sol') {
    usage(`--token must be "usdc" or "sol" (got "${tokenType}").`);
  }

  if (!amountFlag.found) {
    usage('--amount is required (or pass --status to only inspect balances).');
  }
  if (amountFlag.value === null) {
    usage('--amount expects a number, e.g. --amount 50');
  }
  // parseFloat accepts "50abc" and "1e999"; validate the whole string instead so
  // a malformed amount is a usage error rather than a BigInt() RangeError later.
  const rawAmountStr = amountFlag.value.trim();
  const rawAmount = Number(rawAmountStr);
  if (!/^\d*\.?\d+$/.test(rawAmountStr) || !Number.isFinite(rawAmount) || rawAmount <= 0) {
    usage(`--amount must be a positive decimal number (got "${amountFlag.value}").`);
  }

  // ---- Destination ------------------------------------------------------
  const destFlag = readFlag('--dest');
  let destinationPubkey;
  if (destFlag.found && destFlag.value) {
    try {
      destinationPubkey = new PublicKey(destFlag.value);
    } catch (_e) {
      usage(`--dest is not a valid public key: ${destFlag.value}`);
    }
  } else if (isMainnet) {
    usage('--dest is REQUIRED on mainnet-beta — protocol revenue must not default to the admin hot wallet.');
  } else {
    destinationPubkey = adminKeypair.publicKey;
    console.log('\n⚠️  No --dest given; defaulting to the admin wallet (allowed on devnet only).');
  }

  if (isMainnet && !dryRun && !confirmed) {
    console.error('\nRefusing to send on mainnet-beta without --yes.');
    console.error('  Re-run with --dry-run to preview, or add --yes to execute for real.');
    process.exit(1);
  }

  console.log(`\nWithdrawing ${rawAmount} ${tokenType.toUpperCase()} to ${destinationPubkey.toBase58()}...`);
  console.log('Mode:', dryRun ? 'DRY RUN (nothing will be sent)' : 'LIVE');

  let tx;
  let label;

  if (tokenType === 'usdc') {
    if (usdcBalance === null) {
      console.error(`Error: Treasury USDC ATA is not initialized — nothing to withdraw.`);
      process.exit(1);
    }
    if (rawAmount > usdcBalance) {
      console.error(`Error: Insufficient USDC in Treasury. Available: $${usdcBalance.toFixed(2)}, Requested: $${rawAmount}`);
      process.exit(1);
    }
    const amountUnits = BigInt(Math.round(rawAmount * 1e6)); // 6 decimals
    const destUsdcAta = getAta(destinationPubkey, usdcMint);

    // Instruction 14: WithdrawTreasury
    const data = Buffer.concat([Buffer.from([14]), writeU64LE(amountUnits)]);
    tx = new Transaction().add(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: adminPda, isSigner: false, isWritable: false },
          { pubkey: treasuryPda, isSigner: false, isWritable: true },
          { pubkey: destUsdcAta, isSigner: false, isWritable: true },
          { pubkey: treasuryUsdcAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      })
    );
    label = `$${rawAmount} USDC -> ${destUsdcAta.toBase58()}`;
  } else {
    if (rawAmount > solLamports / 1e9) {
      console.error(`Error: Insufficient SOL in Treasury. Available: ${(solLamports / 1e9).toFixed(5)} SOL, Requested: ${rawAmount} SOL`);
      process.exit(1);
    }
    const lamports = BigInt(Math.round(rawAmount * 1e9));
    const data = Buffer.concat([Buffer.from([14]), writeU64LE(lamports)]);
    tx = new Transaction().add(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: adminPda, isSigner: false, isWritable: false },
          { pubkey: treasuryPda, isSigner: false, isWritable: true },
          { pubkey: destinationPubkey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      })
    );
    label = `${rawAmount} SOL -> ${destinationPubkey.toBase58()}`;
  }

  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = adminKeypair.publicKey;
  tx.sign(adminKeypair);

  if (dryRun) {
    // NOTE: for a legacy Transaction, web3.js v1 takes (signers, config).
    const sim = await conn.simulateTransaction(tx, [adminKeypair], { commitment: 'confirmed' });
    if (sim.value.err) {
      console.error(`\n[dry-run] Simulation FAILED: ${JSON.stringify(sim.value.err)}`);
      (sim.value.logs || []).forEach((l) => console.error('   ' + l));
      process.exit(1);
    }
    console.log(`\n[dry-run] Withdrawal simulated OK (${sim.value.unitsConsumed ?? '?'} CU) — not sent.`);
    console.log(`[dry-run] Would transfer ${label}`);
    return;
  }

  const sig = await sendAndConfirmTransaction(conn, tx, [adminKeypair]);
  console.log(`✅ Success! Withdrew ${label}. Tx: ${sig}`);
  const cluster = isMainnet ? '' : '?cluster=devnet';
  console.log(`Solscan: https://solscan.io/tx/${sig}${cluster}`);
}

main().catch((err) => {
  console.error('❌ Withdrawal error:', err.message || err);
  process.exit(1);
});
