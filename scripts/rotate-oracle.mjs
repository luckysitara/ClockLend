// ClockLend oracle authority rotation (instruction tag 13, InitializeAdmin).
//
// This is one of the most dangerous instructions in the protocol: it rewrites
// `oracle_authority` in the AdminConfig PDA, and whoever holds that role can
// write global protocol prices. The round-14 hardening therefore:
//
//   * has NO default new-oracle key. The old default pointed at
//     ~/.config/solana/clocklend-oracle.json, which silently rotated authority
//     to whichever key happened to sit at that path. --new-oracle is now
//     mandatory and is called out loudly if it resolves to that legacy path.
//   * requires an explicit --cluster and proves it with getGenesisHash.
//   * refuses when the cluster and PROGRAM_ID disagree.
//   * prints the current -> proposed authority diff and requires --yes.
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
const ADMIN_SEED = Buffer.from('admin');
const BPF_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

// Never used implicitly — only reachable if the operator types it as --new-oracle.
const LEGACY_DEFAULT_ORACLE_PATH = `${process.env.HOME}/.config/solana/clocklend-oracle.json`;

const args = process.argv.slice(2);
const readFlag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const has = (name) => args.includes(name);

function usage(msg) {
  console.error(`Error: ${msg}\n`);
  console.error('Usage:');
  console.error('  node scripts/rotate-oracle.mjs --cluster <mainnet-beta|devnet> \\');
  console.error('       --new-oracle <PUBKEY | /path/to/keypair.json> [--dry-run] [--yes]\n');
  console.error('  --cluster    REQUIRED. Verified against getGenesisHash before signing.');
  console.error('  --new-oracle REQUIRED. Pubkey, or a keypair file whose pubkey will be used.');
  console.error('  --dry-run    Build and simulate; never send.');
  console.error('  --yes        Required to actually send on mainnet-beta.');
  console.error(`\nThere is no default new-oracle key. Previously this script silently fell back to`);
  console.error(`${LEGACY_DEFAULT_ORACLE_PATH}`);
  console.error('which would rotate control of every price feed to whatever key sat there.');
  process.exit(1);
}

const rawCluster = readFlag('--cluster');
if (!rawCluster) usage('--cluster is required (mainnet-beta or devnet).');
const network = normalizeCluster(rawCluster);
if (!GENESIS_HASHES[network]) usage(`unknown --cluster "${rawCluster}" (expected mainnet-beta or devnet).`);

const newOracleArg = readFlag('--new-oracle');
if (!newOracleArg) usage('--new-oracle is required.');

const dryRun = has('--dry-run');
const confirmed = has('--yes');
const isMainnet = network === 'mainnet-beta';

if (isMainnet && !dryRun && !confirmed) {
  console.error('Refusing to rotate on mainnet-beta without --yes.');
  console.error('  Re-run with --dry-run to preview, or add --yes to execute for real.');
  process.exit(1);
}

// RPC: derived from the explicit cluster, not from an ambient env var, so the
// endpoint can never disagree with --cluster by accident.
const RPC_URL = network === 'devnet'
  ? (process.env.DEVNET_RPC || 'https://api.devnet.solana.com')
  : (process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com');
const conn = new Connection(RPC_URL, 'confirmed');

// Admin Keypair (Upgrade Authority)
const adminKeyPath = process.env.ADMIN_KEY || `${process.env.HOME}/.config/solana/id.json`;
if (!fs.existsSync(adminKeyPath)) {
  console.error(`Admin keypair not found at ${adminKeyPath} (set ADMIN_KEY to override).`);
  process.exit(1);
}
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(adminKeyPath, 'utf8')))
);

// Resolve --new-oracle as either a keypair file or a bare pubkey.
function resolveNewOracle(arg) {
  if (fs.existsSync(arg)) {
    const parsed = JSON.parse(fs.readFileSync(arg, 'utf8'));
    return { pubkey: Keypair.fromSecretKey(new Uint8Array(parsed)).publicKey, source: `keypair file ${arg}` };
  }
  try {
    return { pubkey: new PublicKey(arg), source: `pubkey ${arg}` };
  } catch (_err) {
    console.error(`--new-oracle is neither a readable keypair file nor a valid public key: ${arg}`);
    process.exit(1);
  }
}
const { pubkey: newOraclePubkey, source: newOracleSource } = resolveNewOracle(newOracleArg);

function decodeAdminConfig(data) {
  const d = Buffer.from(data);
  if (d.length < 73 || d.subarray(0, 8).toString() !== 'CLK_ADMN') return null;
  return {
    isInitialized: d[8] === 1,
    admin: new PublicKey(d.subarray(9, 41)).toBase58(),
    oracleAuthority: new PublicKey(d.subarray(41, 73)).toBase58(),
  };
}

async function rotate() {
  console.log('=== ClockLend Oracle Authority Rotation ===');
  console.log('Cluster:            ', network);
  console.log('RPC:                ', RPC_URL);
  console.log('Program:            ', PROGRAM_ID.toBase58());
  console.log('Admin (signer):     ', adminKeypair.publicKey.toBase58());
  console.log('New oracle source:  ', newOracleSource);
  console.log('Mode:               ', dryRun ? 'DRY RUN (nothing will be sent)' : (confirmed ? 'LIVE (--yes)' : 'preview'));

  // 1. Prove the endpoint is the cluster we were told to use.
  const genesis = await assertCluster(conn, network);
  console.log('Genesis:            ', genesis);

  // 2. Refuse when cluster and PROGRAM_ID disagree: the program account must
  //    actually exist on this cluster, or we would be rotating authority on a
  //    program that is not there.
  const programAccount = await conn.getAccountInfo(PROGRAM_ID);
  if (!programAccount) {
    console.error(
      `\nRefusing to continue: program ${PROGRAM_ID.toBase58()} does not exist on ${network}.\n` +
        `  cluster and PROGRAM_ID disagree — set PROGRAM_ID to the address deployed on ${network}.`
    );
    process.exit(1);
  }

  const [adminPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], PROGRAM_ID);
  const [programDataAddress] = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_LOADER);
  console.log('Admin PDA:          ', adminPda.toBase58());
  console.log('ProgramData:        ', programDataAddress.toBase58());

  // 3. Only the on-chain upgrade authority can sign this. Check before spending.
  const programDataAcc = await conn.getAccountInfo(programDataAddress);
  if (!programDataAcc || programDataAcc.data.length < 45) {
    console.error('Could not read the ProgramData account — refusing to continue.');
    process.exit(1);
  }
  const upgradeAuthority = new PublicKey(Buffer.from(programDataAcc.data).subarray(13, 45)).toBase58();
  console.log('Upgrade authority:  ', upgradeAuthority);
  if (upgradeAuthority !== adminKeypair.publicKey.toBase58()) {
    console.error(
      `\nRefusing to continue: the signer ${adminKeypair.publicKey.toBase58()} is NOT the upgrade authority ` +
        `(${upgradeAuthority}).\n  Set ADMIN_KEY to the upgrade-authority keypair.`
    );
    process.exit(1);
  }

  // 4. Old -> new diff.
  const adminAcc = await conn.getAccountInfo(adminPda);
  const current = adminAcc ? decodeAdminConfig(adminAcc.data) : null;
  const currentOracle = current ? current.oracleAuthority : '(AdminConfig not initialized yet)';
  console.log('\n--- Authority change ---');
  console.log(`  admin (unchanged):  ${current ? current.admin : adminKeypair.publicKey.toBase58()}`);
  console.log(`  oracle_authority:   ${currentOracle}`);
  console.log(`                   -> ${newOraclePubkey.toBase58()}`);
  if (current && current.oracleAuthority === newOraclePubkey.toBase58()) {
    console.log('\nNo change: the new oracle authority equals the current one. Nothing to do.');
    if (!dryRun) return;
  }

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

  if (dryRun) {
    const { blockhash } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = adminKeypair.publicKey;
    tx.sign(adminKeypair);
    // NOTE: for a legacy Transaction, web3.js v1 takes (signers, config) —
    // passing a config object as the 2nd positional arg throws "Invalid arguments".
    const sim = await conn.simulateTransaction(tx, [adminKeypair], { commitment: 'confirmed' });
    if (sim.value.err) {
      console.error(`\n[dry-run] Simulation FAILED: ${JSON.stringify(sim.value.err)}`);
      (sim.value.logs || []).forEach((l) => console.error('   ' + l));
      process.exit(1);
    }
    console.log(`\n[dry-run] Rotation simulated OK (${sim.value.unitsConsumed ?? '?'} CU) — not sent.`);
    console.log(`[dry-run] Would set oracle_authority to ${newOraclePubkey.toBase58()}.`);
    return;
  }

  console.log('\nSubmitting rotation transaction...');
  const sig = await sendAndConfirmTransaction(conn, tx, [adminKeypair], { commitment: 'confirmed' });
  console.log(`✅ Rotation successful! Tx: ${sig}`);

  // Verification
  const acc = await conn.getAccountInfo(adminPda);
  if (acc) {
    const decoded = decodeAdminConfig(acc.data);
    if (!decoded) {
      console.error('Could not decode the AdminConfig account after rotation.');
      process.exit(1);
    }
    console.log('\n=== On-Chain Verification ===');
    console.log('Admin:', decoded.admin);
    console.log('Oracle Authority:', decoded.oracleAuthority);
    if (decoded.oracleAuthority === newOraclePubkey.toBase58()) {
      console.log('🎉 Confirmed: New oracle authority is active on-chain!');
    } else {
      console.error('❌ On-chain oracle authority does not match the intended value.');
      process.exit(1);
    }
  }
}

rotate().catch((err) => {
  console.error('❌ Rotation failed:', err.message || err);
  process.exit(1);
});
