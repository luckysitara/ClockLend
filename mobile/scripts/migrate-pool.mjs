// mobile/scripts/migrate-pool.mjs
//
// Migrates 50 USDC from legacy Pool #1 (90% LTV) to production Pool #2
// (65% LTV, 8.00% APR).
//
// This script signs and sends REAL transactions, and it previously had none of
// the guards its siblings carry (scripts/withdraw-treasury.mjs, burn-skr.mjs,
// rotate-oracle.mjs): no cluster proof, no --dry-run, no --yes gate, and a
// hardcoded keypair path belonging to a different machine. It now follows the
// same pattern as those scripts.
//
// Usage:
//   node mobile/scripts/migrate-pool.mjs --cluster mainnet-beta --dry-run
//   node mobile/scripts/migrate-pool.mjs --cluster mainnet-beta --yes

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'fs';
import {
  assertCluster,
  normalizeCluster,
  GENESIS_HASHES,
} from '../../scripts/lib/cluster-guard.mjs';
import { redactUrl } from '../../scripts/lib/redact-url.mjs';

function w64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function w64s(n) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n));
  return b;
}
function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

// ---- invocation guards -----------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const readFlag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? { present: false, value: undefined } : { present: true, value: argv[i + 1] };
};

const rawCluster = readFlag('--cluster').value || process.env.NETWORK;
if (!rawCluster) {
  console.error('Refusing to run: pass --cluster <mainnet-beta|devnet|localnet>.');
  console.error('This script signs and sends real transactions, so the cluster must be explicit.');
  process.exit(1);
}
const network = normalizeCluster(rawCluster);
if (!GENESIS_HASHES[network]) {
  console.error(`Unknown cluster "${rawCluster}". Expected one of: mainnet-beta, devnet, localnet.`);
  process.exit(1);
}
const isMainnet = network === 'mainnet-beta';
const dryRun = has('--dry-run');
const confirmed = has('--yes');

// Keyless only: never fall back to a keyed URL in a tracked script.
const RPC = process.env.MAINNET_RPC || 'https://solana-rpc.publicnode.com';
const connection = new Connection(RPC, 'confirmed');

// No hardcoded default. This used to point at /home/rootkit/... — another
// machine's home directory — so a stray invocation either failed confusingly or,
// worse, signed with whatever key happened to be there.
const keyPath = process.env.DEPLOYER_KEY;
if (!keyPath) {
  console.error('Refusing to run: set DEPLOYER_KEY to the deployer keypair JSON path.');
  process.exit(1);
}
const deployerKey = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8')))
);

const PROGRAM_ID = new PublicKey('4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const oldPool = new PublicKey('4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu');
const oldVault = new PublicKey('kQy8nEuQ7wmGPyZYR5gR19noTDfL942gUpCLw869v5o');
const authorityAta = new PublicKey('7ugKS6WabMw1zzKRkBKP7V8EQP6FKmZwY1uib82JF72i');

const newPoolId = 2n;
const [newPoolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('pool'), deployerKey.publicKey.toBuffer(), w64(newPoolId)],
  PROGRAM_ID
);
const [newVaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), newPoolPda.toBuffer()],
  PROGRAM_ID
);

async function main() {
  console.log('=== CLOCKLEND DESK MIGRATION ===');
  console.log('Cluster:', network);
  console.log('RPC:', redactUrl(RPC));
  console.log('Deployer / Authority:', deployerKey.publicKey.toBase58());
  console.log('Old Pool (ID #1):', oldPool.toBase58());
  console.log('New Pool (ID #2):', newPoolPda.toBase58());
  console.log('New Vault PDA:', newVaultPda.toBase58());

  // Prove the endpoint really is the cluster we were told, before signing
  // anything. Throws on mismatch and must not be caught.
  const genesis = await assertCluster(connection, network);
  console.log('Genesis:', genesis);

  // Step 1: Withdraw 50 USDC from old pool
  const withdrawData = Buffer.alloc(9);
  withdrawData.writeUInt8(9, 0); // tag 9 = WithdrawLiquidity
  withdrawData.writeBigUInt64LE(50_000_000n, 1);

  const withdrawIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: deployerKey.publicKey, isSigner: true, isWritable: true },
      { pubkey: oldPool, isSigner: false, isWritable: true },
      { pubkey: oldVault, isSigner: false, isWritable: true },
      { pubkey: authorityAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: withdrawData,
  });

  // Step 2: Initialize New Pool #2 (Circle, 8.00% APR, 65% LTV, 3-30 days)
  const poolName = Buffer.alloc(32);
  Buffer.from('ClockLend Genesis USDC Desk').copy(poolName);

  const initPoolIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: deployerKey.publicKey, isSigner: true, isWritable: true },
      { pubkey: newPoolPda, isSigner: false, isWritable: true },
      { pubkey: USDC_MAINNET_MINT, isSigner: false, isWritable: false },
      { pubkey: newVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0]), // tag 0 = InitializePool
      w64(newPoolId),
      Buffer.from([1]), // Circle
      u16(800), // 8.00% APR
      u16(6500), // 65.00% LTV
      w64s(3 * 86400), // min 3 days
      w64s(30 * 86400), // max 30 days
      poolName,
      Buffer.from([0]), // is_oracle_free = false (uses live price feeds)
    ]),
  });

  // Step 3: Deposit 50 USDC into New Pool #2
  const depositData = Buffer.alloc(9);
  depositData.writeUInt8(1, 0); // tag 1 = DepositLiquidity
  depositData.writeBigUInt64LE(50_000_000n, 1);

  const depositIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: deployerKey.publicKey, isSigner: true, isWritable: true },
      { pubkey: newPoolPda, isSigner: false, isWritable: true },
      { pubkey: authorityAta, isSigner: false, isWritable: true },
      { pubkey: newVaultPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: depositData,
  });

  if (dryRun) {
    console.log('\n--dry-run: simulating both transactions, nothing will be signed or sent.');
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx1 = new Transaction().add(withdrawIx);
    tx1.recentBlockhash = blockhash;
    tx1.feePayer = deployerKey.publicKey;
    const sim1 = await connection.simulateTransaction(tx1);
    console.log('[1/3] withdraw simulation:', sim1.value.err ?? 'ok');

    const tx2 = new Transaction().add(initPoolIx).add(depositIx);
    tx2.recentBlockhash = blockhash;
    tx2.feePayer = deployerKey.publicKey;
    const sim2 = await connection.simulateTransaction(tx2);
    console.log('[2/3+3/3] init+deposit simulation:', sim2.value.err ?? 'ok');
    return;
  }

  if (isMainnet && !confirmed) {
    console.error('\nRefusing to send on mainnet-beta without --yes.');
    console.error('Re-run with --dry-run to simulate first, or add --yes to proceed.');
    process.exit(1);
  }

  console.log('\n[1/3] Withdrawing 50.00 USDC from Old Pool #1 to Authority ATA...');
  const tx1 = new Transaction().add(withdrawIx);
  const sig1 = await sendAndConfirmTransaction(connection, tx1, [deployerKey], {
    commitment: 'confirmed',
  });
  console.log('✅ 50 USDC Withdrawn successfully. Tx:', sig1);

  console.log('\n[2/3] Initializing New Production Lending Desk (ID #2)...');
  console.log('\n[3/3] Depositing 50.00 USDC into New Pool #2 Vault...');
  const tx2 = new Transaction().add(initPoolIx).add(depositIx);
  const sig2 = await sendAndConfirmTransaction(connection, tx2, [deployerKey], {
    commitment: 'confirmed',
  });
  console.log('✅ Pool #2 Initialized & Funded with 50.00 USDC! Tx:', sig2);

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log('New Pool PDA:', newPoolPda.toBase58());
  console.log('New Vault PDA:', newVaultPda.toBase58());
  console.log('Explorer:', `https://solscan.io/account/${newPoolPda.toBase58()}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
