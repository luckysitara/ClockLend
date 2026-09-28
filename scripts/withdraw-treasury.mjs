import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const PROGRAM_ID = new PublicKey('HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ADMIN_SEED = Buffer.from('admin');
const TREASURY_SEED = Buffer.from('treasury');

// Token Mints
const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const args = process.argv.slice(2);
const network = args.includes('--network') ? args[args.indexOf('--network') + 1] : (process.env.NETWORK || 'devnet');
const isMainnet = network === 'mainnet-beta' || network === 'mainnet';
const RPC_URL = isMainnet
  ? (process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com')
  : (process.env.DEVNET_RPC || 'https://api.devnet.solana.com');

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

async function main() {
  const [adminPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], PROGRAM_ID);
  const [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID);

  console.log('=== ClockLend Treasury Profit Withdrawal ===');
  console.log('Network:', network);
  console.log('Admin Signer:', adminKeypair.publicKey.toBase58());
  console.log('Treasury PDA:', treasuryPda.toBase58());

  // Check Treasury Balances
  const solLamports = await conn.getBalance(treasuryPda);
  console.log(`Treasury Native SOL Balance: ${(solLamports / 1e9).toFixed(5)} SOL`);

  const usdcMint = isMainnet ? USDC_MAINNET_MINT : USDC_DEVNET_MINT;
  const treasuryUsdcAta = PublicKey.findProgramAddressSync(
    [treasuryPda.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), usdcMint.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  )[0];

  let usdcBalance = 0;
  try {
    const res = await conn.getTokenAccountBalance(treasuryUsdcAta);
    usdcBalance = res.value.uiAmount || 0;
    console.log(`Treasury USDC ATA Balance: $${usdcBalance.toFixed(2)} USDC (${treasuryUsdcAta.toBase58()})`);
  } catch (_) {
    console.log(`Treasury USDC ATA not initialized yet (${treasuryUsdcAta.toBase58()})`);
  }

  // Parse withdrawal request
  const amountArg = args.find((a) => a.startsWith('--amount=') || args[args.indexOf('--amount') + 1]);
  if (!amountArg && !args.includes('--status')) {
    console.log('\nUsage:');
    console.log('  # Check Treasury Balances:');
    console.log('  node scripts/withdraw-treasury.mjs --status');
    console.log('\n  # Withdraw USDC Profit:');
    console.log('  node scripts/withdraw-treasury.mjs --amount 50 --token usdc --dest <DESTINATION_WALLET>');
    console.log('\n  # Withdraw SOL Profit:');
    console.log('  node scripts/withdraw-treasury.mjs --amount 1.5 --token sol --dest <DESTINATION_WALLET>');
    return;
  }

  if (args.includes('--status')) return;

  const rawAmount = parseFloat(args.includes('--amount') ? args[args.indexOf('--amount') + 1] : amountArg.split('=')[1]);
  const tokenType = (args.includes('--token') ? args[args.indexOf('--token') + 1] : 'usdc').toLowerCase();
  const destArg = args.includes('--dest') ? args[args.indexOf('--dest') + 1] : adminKeypair.publicKey.toBase58();
  const destinationPubkey = new PublicKey(destArg);

  console.log(`\nWithdrawing ${rawAmount} ${tokenType.toUpperCase()} to ${destinationPubkey.toBase58()}...`);

  if (tokenType === 'usdc') {
    const amountUnits = BigInt(Math.round(rawAmount * 1e6)); // 6 decimals
    const destUsdcAta = PublicKey.findProgramAddressSync(
      [destinationPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), usdcMint.toBuffer()],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
    )[0];

    // Instruction 14: WithdrawTreasury
    const data = Buffer.concat([Buffer.from([14]), writeU64LE(amountUnits)]);

    const tx = new Transaction().add(
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

    const sig = await sendAndConfirmTransaction(conn, tx, [adminKeypair]);
    console.log(`✅ Success! Withdrew $${rawAmount} USDC to ${destUsdcAta.toBase58()}. Tx: ${sig}`);
  } else {
    // Native SOL
    const lamports = BigInt(Math.round(rawAmount * 1e9));
    const data = Buffer.concat([Buffer.from([14]), writeU64LE(lamports)]);

    const tx = new Transaction().add(
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

    const sig = await sendAndConfirmTransaction(conn, tx, [adminKeypair]);
    console.log(`✅ Success! Withdrew ${rawAmount} SOL to ${destinationPubkey.toBase58()}. Tx: ${sig}`);
  }
}

main().catch((err) => {
  console.error('❌ Withdrawal error:', err.message || err);
  process.exit(1);
});
