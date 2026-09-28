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
const ADMIN_SEED = Buffer.from('admin');

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const conn = new Connection(RPC_URL, 'confirmed');

// Admin Keypair (Upgrade Authority)
const adminKeyPath = process.env.ADMIN_KEY || `${process.env.HOME}/.config/solana/id.json`;
if (!fs.existsSync(adminKeyPath)) {
  console.error(`Admin keypair not found at ${adminKeyPath}`);
  process.exit(1);
}
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(adminKeyPath, 'utf8')))
);

// New Oracle Keypair / Pubkey
const oracleKeyArg = process.argv[2] || process.env.NEW_ORACLE_KEY || `${process.env.HOME}/.config/solana/clocklend-oracle.json`;
let newOraclePubkey;
if (fs.existsSync(oracleKeyArg)) {
  const parsed = JSON.parse(fs.readFileSync(oracleKeyArg, 'utf8'));
  newOraclePubkey = Keypair.fromSecretKey(new Uint8Array(parsed)).publicKey;
} else {
  try {
    newOraclePubkey = new PublicKey(oracleKeyArg);
  } catch (err) {
    console.error(`Invalid public key or file path: ${oracleKeyArg}`);
    process.exit(1);
  }
}

async function rotate() {
  console.log('=== ClockLend Oracle Authority Rotation ===');
  console.log('RPC:', RPC_URL);
  console.log('Admin (Signer):', adminKeypair.publicKey.toBase58());
  console.log('New Oracle Authority:', newOraclePubkey.toBase58());

  const [adminPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], PROGRAM_ID);
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [PROGRAM_ID.toBuffer()],
    new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
  );

  console.log('Admin PDA:', adminPda.toBase58());
  console.log('ProgramData:', programDataAddress.toBase58());

  // Instruction 13: InitializeAdmin / Rotation
  // Accounts:
  // 0. [signer] Authority (Upgrade Authority)
  // 1. [writable] AdminConfig PDA
  // 2. [] System Program
  // 3. [] ProgramData account
  // 4. [] New Admin (keep existing admin)
  // 5. [] New Oracle Authority
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: adminPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: programDataAddress, isSigner: false, isWritable: false },
        { pubkey: adminKeypair.publicKey, isSigner: false, isWritable: false }, // keep existing admin
        { pubkey: newOraclePubkey, isSigner: false, isWritable: false },       // new oracle authority
      ],
      data: Buffer.from([13]), // InitializeAdmin tag
    })
  );

  console.log('\nSubmitting rotation transaction...');
  const sig = await sendAndConfirmTransaction(conn, tx, [adminKeypair], { commitment: 'confirmed' });
  console.log(`✅ Rotation successful! Tx: ${sig}`);

  // Verification
  const acc = await conn.getAccountInfo(adminPda);
  if (acc) {
    const onChainAdmin = new PublicKey(acc.data.subarray(9, 41)).toBase58();
    const onChainOracle = new PublicKey(acc.data.subarray(41, 73)).toBase58();
    console.log('\n=== On-Chain Verification ===');
    console.log('Admin:', onChainAdmin);
    console.log('Oracle Authority:', onChainOracle);
    if (onChainOracle === newOraclePubkey.toBase58()) {
      console.log('🎉 Confirmed: New oracle authority is active on-chain!');
    }
  }
}

rotate().catch((err) => {
  console.error('❌ Rotation failed:', err.message || err);
  process.exit(1);
});
