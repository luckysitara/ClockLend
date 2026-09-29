// ClockLend SKR buyback & burn.
//
// SAFETY MODEL (round-14 hardening):
//   * Every run proves the RPC endpoint matches the intended cluster via
//     getGenesisHash before it signs anything.
//   * Mainnet sends require an explicit --yes. Without it the script only
//     builds and simulates.
//   * --dry-run builds + simulates + prints effects and never sends.
//   * The Jupiter swap transaction is treated as UNTRUSTED INPUT: the fee payer
//     is asserted to be the admin key, every program id in the message must be
//     on an allowlist, and the transaction is simulated before signing.
//   * The amount burned is the *measured delta* of the admin SKR balance across
//     the swap (post - pre), not the account balance. A failed balance read is
//     fatal — it is never coerced to 0.
import fs from 'fs';
import { assertCluster, normalizeCluster } from './lib/cluster-guard.mjs';

// scripts/ has no node_modules of its own: resolve @solana/web3.js from a real
// install, else borrow the copy vendored under serverless/ or mobile/ so the
// script still runs on a bare checkout.
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
  VersionedTransaction,
} = web3;

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const ADMIN_SEED = Buffer.from('admin');
const TREASURY_SEED = Buffer.from('treasury');

// Token Mints
const SKR_MINT = new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Program ids permitted to appear in a Jupiter swap transaction.
//
// The aggregator routes through its own on-chain program plus a small set of
// standard runtime programs; a route that touches anything else means the
// "swap transaction" is not what it claims to be. Each id below was verified
// live on mainnet-beta with getAccountInfo (executable = true) before being
// allowlisted. Operators can extend this via JUPITER_PROGRAM_ALLOWLIST, but an
// unknown program id always aborts the run — it is never silently skipped.
const DEFAULT_ALLOWED_SWAP_PROGRAMS = [
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter Aggregator v6
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter Aggregator v4
  'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph', // Jupiter Aggregator v3
  'ComputeBudget111111111111111111111111111111', // priority-fee instructions
  '11111111111111111111111111111111', // System program (SOL wrapping)
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Account
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', // SPL Memo
];
const ALLOWED_SWAP_PROGRAMS = new Set([
  ...DEFAULT_ALLOWED_SWAP_PROGRAMS,
  ...(process.env.JUPITER_PROGRAM_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
]);

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const network = normalizeCluster(readFlag('--network', readFlag('--cluster', process.env.NETWORK || 'mainnet-beta')));
const isMainnet = network === 'mainnet-beta';
const dryRun = args.includes('--dry-run');
const confirmed = args.includes('--yes');
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

function getAta(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATOKEN_PROGRAM_ID
  )[0];
}

function createAtaIdempotentInstruction(payer, ata, owner, mint) {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ATOKEN_PROGRAM_ID,
    data: Buffer.from([1]),
  });
}

function createBurnInstruction(account, mint, owner, amount) {
  const data = Buffer.alloc(9);
  data.writeUInt8(8, 0); // Instruction 8: Burn
  const big = BigInt(amount);
  data.writeUInt32LE(Number(big & 0xffffffffn), 1);
  data.writeUInt32LE(Number((big >> 32n) & 0xffffffffn), 5);
  return new TransactionInstruction({
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_PROGRAM_ID,
    data,
  });
}

// STRICT balance read. Any failure throws — it is never coerced to 0, because a
// silent 0 would read as "nothing to burn" (buy path) or "nothing to spend"
// (treasury guard), both of which corrupt the amount math rather than failing.
async function getTokenBalanceStrict(ataPubkey) {
  const res = await conn.getTokenAccountBalance(ataPubkey);
  if (!res || !res.value || res.value.amount === undefined || res.value.amount === null) {
    throw new Error(`RPC returned no usable balance for ${ataPubkey.toBase58()}`);
  }
  return {
    uiAmount: res.value.uiAmount !== undefined && res.value.uiAmount !== null
      ? res.value.uiAmount
      : Number(res.value.amount) / 10 ** res.value.decimals,
    amount: BigInt(res.value.amount),
    decimals: res.value.decimals,
  };
}

// Display-only read: reports "unavailable" instead of pretending the balance is 0.
async function readBalanceForDisplay(ataPubkey) {
  try {
    return await getTokenBalanceStrict(ataPubkey);
  } catch (e) {
    return { unavailable: true, error: e.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Jupiter swap transaction verification
// ---------------------------------------------------------------------------

/** Resolve every account key in a (possibly v0) message, including lookup tables. */
async function resolveAccountKeys(message) {
  const staticKeys = message.staticAccountKeys || message.accountKeys || [];
  if (!message.addressTableLookups || message.addressTableLookups.length === 0) {
    return staticKeys;
  }
  const writable = [];
  const readonly = [];
  for (const lookup of message.addressTableLookups) {
    const res = await conn.getAddressLookupTable(lookup.accountKey);
    const table = res.value;
    // Fail closed: an unresolvable table means we cannot prove which programs
    // the transaction touches, so we must not sign it.
    if (!table) {
      throw new Error(`Cannot resolve address lookup table ${lookup.accountKey.toBase58()} — refusing to sign`);
    }
    for (const i of lookup.writableIndexes) writable.push(table.state.addresses[i]);
    for (const i of lookup.readonlyIndexes) readonly.push(table.state.addresses[i]);
  }
  if (typeof message.getAccountKeys === 'function') {
    return message.getAccountKeys({ accountKeysFromLookups: { writable, readonly } });
  }
  return [...staticKeys, ...writable, ...readonly];
}

/** Assert the swap tx pays fees from the admin key and touches only known programs. */
async function verifyJupiterSwapTx(swapTx, expectedFeePayer) {
  const message = swapTx.message;

  const staticKeys = message.staticAccountKeys || message.accountKeys || [];
  const feePayer = staticKeys[0];
  if (!feePayer) throw new Error('Swap transaction has no fee payer');
  if (!feePayer.equals(expectedFeePayer)) {
    throw new Error(
      `Refusing to sign: swap fee payer is ${feePayer.toBase58()}, expected the admin key ` +
        `${expectedFeePayer.toBase58()}`
    );
  }

  const keys = await resolveAccountKeys(message);
  const programIds = [
    ...new Set(message.compiledInstructions.map((ix) => keys[ix.programIdIndex].toBase58())),
  ];
  const unknown = programIds.filter((p) => !ALLOWED_SWAP_PROGRAMS.has(p));
  if (unknown.length > 0) {
    throw new Error(
      `Refusing to sign: swap transaction invokes program id(s) not on the allowlist: ${unknown.join(', ')}.\n` +
        `  Allowed: ${[...ALLOWED_SWAP_PROGRAMS].join(', ')}\n` +
        `  If this is a legitimate new Jupiter program, re-run with ` +
        `JUPITER_PROGRAM_ALLOWLIST=<id> after verifying it on-chain.`
    );
  }

  return { feePayer: feePayer.toBase58(), programIds };
}

// ---------------------------------------------------------------------------
// Send / simulate helpers
// ---------------------------------------------------------------------------

async function simulateVersioned(tx, label) {
  const sim = await conn.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: 'confirmed',
  });
  if (sim.value.err) {
    throw new Error(`${label} simulation FAILED: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs || []).join('\n')}`);
  }
  console.log(`  ${label} simulated OK (${sim.value.unitsConsumed ?? '?'} CU)`);
  return sim.value;
}

/** Send (or, in dry-run, only simulate) a legacy transaction. Returns a signature or null. */
async function sendLegacy(tx, label) {
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = adminKeypair.publicKey;
  tx.sign(adminKeypair);

  if (dryRun) {
    // NOTE: for a legacy Transaction, web3.js v1 takes (signers, config) —
    // passing a config object as the 2nd positional arg throws "Invalid arguments".
    const sim = await conn.simulateTransaction(tx, [adminKeypair], { commitment: 'confirmed' });
    if (sim.value.err) {
      throw new Error(`[dry-run] ${label} simulation FAILED: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs || []).join('\n')}`);
    }
    console.log(`  [dry-run] ${label} simulated OK (${sim.value.unitsConsumed ?? '?'} CU) — not sent`);
    return null;
  }

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function main() {
  const [adminPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], PROGRAM_ID);
  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID);

  const usdcMint = isMainnet ? USDC_MAINNET_MINT : USDC_DEVNET_MINT;
  const treasuryUsdcAta = getAta(treasuryPda, usdcMint);
  const treasurySkrAta = getAta(treasuryPda, SKR_MINT);

  const adminUsdcAta = getAta(adminKeypair.publicKey, usdcMint);
  const adminSkrAta = getAta(adminKeypair.publicKey, SKR_MINT);

  console.log('====================================================');
  console.log('🔥 ClockLend SKR Buyback & Burn Portal');
  console.log('====================================================');
  console.log('Network:       ', network);
  console.log('RPC:           ', RPC_URL);
  console.log('Admin Signer:  ', adminKeypair.publicKey.toBase58());
  console.log('Treasury PDA:  ', treasuryPda.toBase58());
  console.log('Mode:          ', dryRun ? 'DRY RUN (nothing will be sent)' : (confirmed ? 'LIVE (--yes)' : 'build + simulate only'));

  const genesis = await assertCluster(conn, network);
  console.log('Genesis:       ', genesis, `(matches ${network})`);

  // If status only
  if (args.includes('--status') || args.length === 0) {
    const treasurySolLamports = await conn.getBalance(treasuryPda);
    const treasuryUsdc = await readBalanceForDisplay(treasuryUsdcAta);
    const treasurySkr = await readBalanceForDisplay(treasurySkrAta);
    console.log('\n--- Treasury Balances ---');
    console.log(`Native SOL:     ${(treasurySolLamports / 1e9).toFixed(4)} SOL`);
    console.log(`USDC Balance:   ${treasuryUsdc.unavailable ? `unavailable (${treasuryUsdc.error})` : `$${treasuryUsdc.uiAmount.toFixed(2)} USDC (${treasuryUsdcAta.toBase58()})`}`);
    console.log(`SKR Balance:    ${treasurySkr.unavailable ? `unavailable (${treasurySkr.error})` : `${treasurySkr.uiAmount.toLocaleString()} SKR (${treasurySkrAta.toBase58()})`}`);

    console.log('\n📖 Execution Modes:');
    console.log('1. DIRECT BURN (Burn SKR already in Treasury PDA):');
    console.log('   node scripts/burn-skr.mjs --direct --amount 5000 --network mainnet');
    console.log('   node scripts/burn-skr.mjs --direct --pct 50 --network mainnet');
    console.log('\n2. BUY & BURN (Use Treasury USDC / SOL to buy SKR on Jupiter & burn):');
    console.log('   node scripts/burn-skr.mjs --buy --token usdc --amount 100 --network mainnet');
    console.log('   node scripts/burn-skr.mjs --buy --token usdc --pct 25 --network mainnet');
    console.log('   node scripts/burn-skr.mjs --buy --token sol --amount 1.5 --network mainnet');
    console.log('\nAdd --dry-run to build and simulate without sending; add --yes to send on mainnet.');
    return;
  }

  const isDirect = args.includes('--direct');
  const isBuy = args.includes('--buy');

  if (!isDirect && !isBuy) {
    console.error('Error: Please specify either --direct (burn Treasury SKR) or --buy (buy SKR on DEX & burn).');
    process.exit(1);
  }
  if (isDirect && isBuy) {
    console.error('Error: --direct and --buy are mutually exclusive.');
    process.exit(1);
  }

  // Mainnet sends require an explicit acknowledgement. --dry-run never sends, so
  // it is allowed through without --yes.
  if (isMainnet && !dryRun && !confirmed) {
    console.error(
      'Refusing to send on mainnet without --yes.\n' +
        '  Re-run with --dry-run to build and simulate the transaction, or add --yes to execute for real.'
    );
    process.exit(1);
  }

  // Parse amount or percentage
  let pctVal = null;
  if (args.includes('--pct')) {
    pctVal = parseFloat(args[args.indexOf('--pct') + 1]);
    if (isNaN(pctVal) || pctVal <= 0 || pctVal > 100) {
      console.error('Error: --pct must be a number between 0 and 100.');
      process.exit(1);
    }
  }

  let amountVal = null;
  if (args.includes('--amount')) {
    amountVal = parseFloat(args[args.indexOf('--amount') + 1]);
    if (isNaN(amountVal) || amountVal <= 0) {
      console.error('Error: --amount must be a positive number.');
      process.exit(1);
    }
  }

  if (pctVal === null && amountVal === null) {
    console.error('Error: Please specify either --amount <NUMBER> or --pct <1-100>.');
    process.exit(1);
  }

  // =========================================================================
  // MODE 1: DIRECT BURN (From Treasury SKR)
  // =========================================================================
  if (isDirect) {
    console.log('\n🔥 Initiating Direct SKR Burn from Treasury...');
    // Amount math reads the treasury balance, so this read must be strict.
    let treasurySkr;
    try {
      treasurySkr = await getTokenBalanceStrict(treasurySkrAta);
    } catch (e) {
      console.error(
        `\nCannot read the Treasury SKR balance (${treasurySkrAta.toBase58()}): ${e.message || e}\n` +
          '  The Treasury SKR token account does not exist yet, or the Treasury PDA has never been\n' +
          '  initialized (which also means no protocol fees have been collected). Refusing to guess a\n' +
          '  balance — check `node scripts/burn-skr.mjs --status --network ' + network + '` first.'
      );
      process.exit(1);
    }

    let burnSkrUi = amountVal;
    if (pctVal !== null) {
      burnSkrUi = (treasurySkr.uiAmount * pctVal) / 100;
      console.log(`Calculating ${pctVal}% of Treasury SKR: ${burnSkrUi.toLocaleString()} SKR`);
    }

    if (burnSkrUi <= 0 || burnSkrUi > treasurySkr.uiAmount) {
      console.error(`Error: Insufficient SKR in Treasury. Available: ${treasurySkr.uiAmount} SKR, Requested: ${burnSkrUi} SKR`);
      process.exit(1);
    }

    const burnUnits = BigInt(Math.round(burnSkrUi * 1e6)); // SKR has 6 decimals
    console.log(`Burning ${burnSkrUi.toLocaleString()} SKR (${burnUnits.toString()} base units)...`);

    // Build atomic transaction:
    // 1. Ensure Admin SKR ATA exists
    // 2. WithdrawTreasury (Treasury PDA -> Admin SKR ATA)
    // 3. Burn (Admin SKR ATA -> destroyed)
    const tx = new Transaction();
    tx.add(createAtaIdempotentInstruction(adminKeypair.publicKey, adminSkrAta, adminKeypair.publicKey, SKR_MINT));

    // Instruction 14: WithdrawTreasury
    const withdrawData = Buffer.concat([Buffer.from([14]), writeU64LE(burnUnits)]);
    tx.add(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: adminPda, isSigner: false, isWritable: false },
          { pubkey: treasuryPda, isSigner: false, isWritable: true },
          { pubkey: adminSkrAta, isSigner: false, isWritable: true },
          { pubkey: treasurySkrAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: withdrawData,
      })
    );

    // Instruction 8: Burn
    tx.add(createBurnInstruction(adminSkrAta, SKR_MINT, adminKeypair.publicKey, burnUnits));

    console.log('Building atomic withdraw-and-burn transaction...');
    const sig = await sendLegacy(tx, 'direct withdraw+burn');

    if (dryRun) {
      console.log('\n[dry-run] No transaction sent. Would have burned:', burnSkrUi.toLocaleString(), 'SKR');
      console.log('[dry-run] Treasury SKR before:', treasurySkr.uiAmount.toLocaleString(), 'SKR');
      return;
    }

    console.log('\n🎉 SUCCESS! Direct Burn Complete!');
    console.log(`Total SKR Burned: ${burnSkrUi.toLocaleString()} SKR`);
    console.log(`Transaction Signature: ${sig}`);
    console.log(`Solscan Proof: https://solscan.io/tx/${sig}${isMainnet ? '' : '?cluster=devnet'}`);
    return;
  }

  // =========================================================================
  // MODE 2: BUY & BURN (From Treasury USDC or SOL via Jupiter)
  // =========================================================================
  if (isBuy) {
    const tokenType = (args.includes('--token') ? args[args.indexOf('--token') + 1] : 'usdc').toLowerCase();
    if (tokenType !== 'usdc' && tokenType !== 'sol') {
      console.error('Error: --token must be either "usdc" or "sol".');
      process.exit(1);
    }

    if (!isMainnet) {
      console.warn('\n⚠️  Notice: Jupiter DEX aggregator runs on Solana Mainnet-beta.');
      console.warn('Devnet mock tokens do not have live Jupiter AMM liquidity pools.');
      console.warn('For Devnet testing, please use Direct Burn (`--direct`) or test against Mainnet (`--network mainnet`).\n');
    }

    // Spending is gated on the treasury balance, so this read must be strict.
    const treasurySolLamports = await conn.getBalance(treasuryPda);
    const treasurySolUi = treasurySolLamports / 1e9;
    const treasuryUsdc = tokenType === 'usdc' ? await getTokenBalanceStrict(treasuryUsdcAta) : null;

    let spendAmountUi = amountVal;
    let spendBaseUnits = 0n;
    let inputMint = usdcMint;

    if (tokenType === 'usdc') {
      if (pctVal !== null) {
        spendAmountUi = (treasuryUsdc.uiAmount * pctVal) / 100;
        console.log(`Calculating ${pctVal}% of Treasury USDC: $${spendAmountUi.toFixed(2)} USDC`);
      }
      if (spendAmountUi <= 0 || spendAmountUi > treasuryUsdc.uiAmount) {
        console.error(`Error: Insufficient USDC in Treasury. Available: $${treasuryUsdc.uiAmount}, Requested: $${spendAmountUi}`);
        process.exit(1);
      }
      spendBaseUnits = BigInt(Math.round(spendAmountUi * 1e6));
      inputMint = usdcMint;
      console.log(`\nInitiating Buy & Burn: Spending $${spendAmountUi.toFixed(2)} USDC to acquire & burn SKR...`);
    } else {
      // SOL
      if (pctVal !== null) {
        spendAmountUi = (treasurySolUi * pctVal) / 100;
        console.log(`Calculating ${pctVal}% of Treasury SOL: ${spendAmountUi.toFixed(4)} SOL`);
      }
      if (spendAmountUi <= 0 || spendAmountUi > treasurySolUi) {
        console.error(`Error: Insufficient SOL in Treasury. Available: ${treasurySolUi} SOL, Requested: ${spendAmountUi} SOL`);
        process.exit(1);
      }
      spendBaseUnits = BigInt(Math.round(spendAmountUi * 1e9));
      inputMint = WSOL_MINT;
      console.log(`\nInitiating Buy & Burn: Spending ${spendAmountUi.toFixed(4)} SOL to acquire & burn SKR...`);
    }

    // Step 1: Withdraw from Treasury PDA to Admin Wallet
    console.log('\n[Step 1/3] Withdrawing allocated funds from Treasury PDA...');
    const withdrawTx = new Transaction();
    const withdrawData = Buffer.concat([Buffer.from([14]), writeU64LE(spendBaseUnits)]);

    if (tokenType === 'usdc') {
      withdrawTx.add(createAtaIdempotentInstruction(adminKeypair.publicKey, adminUsdcAta, adminKeypair.publicKey, usdcMint));
      withdrawTx.add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: adminPda, isSigner: false, isWritable: false },
            { pubkey: treasuryPda, isSigner: false, isWritable: true },
            { pubkey: adminUsdcAta, isSigner: false, isWritable: true },
            { pubkey: treasuryUsdcAta, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: withdrawData,
        })
      );
    } else {
      withdrawTx.add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: adminPda, isSigner: false, isWritable: false },
            { pubkey: treasuryPda, isSigner: false, isWritable: true },
            { pubkey: adminKeypair.publicKey, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: withdrawData,
        })
      );
    }

    const withdrawSig = await sendLegacy(withdrawTx, 'treasury withdrawal');
    if (withdrawSig) console.log(`✅ Treasury withdrawal confirmed. Tx: ${withdrawSig}`);
    else console.log('  [dry-run] treasury withdrawal not sent');

    // Step 2: Swap via Jupiter API
    console.log('\n[Step 2/3] Fetching best DEX route via Jupiter API...');
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint.toBase58()}&outputMint=${SKR_MINT.toBase58()}&amount=${spendBaseUnits.toString()}&slippageBps=100`;
    const quoteRes = await (await fetch(quoteUrl)).json();

    if (!quoteRes || !quoteRes.outAmount) {
      console.error('Failed to get quote from Jupiter:', quoteRes);
      process.exit(1);
    }

    const expectedSkr = (Number(quoteRes.outAmount) / 1e6).toLocaleString();
    console.log(`Quote received: Expected ~${expectedSkr} SKR across ${quoteRes.routePlan?.length || 1} route step(s).`);

    console.log('Requesting swap transaction from Jupiter...');
    const swapReq = await (
      await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteRes,
          userPublicKey: adminKeypair.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
        }),
      })
    ).json();

    if (!swapReq || !swapReq.swapTransaction) {
      console.error('Failed to get swap transaction from Jupiter:', swapReq);
      process.exit(1);
    }

    const swapTxBuf = Buffer.from(swapReq.swapTransaction, 'base64');
    const swapTx = VersionedTransaction.deserialize(swapTxBuf);

    // Treat the returned transaction as untrusted: prove it pays from our key
    // and only invokes allowlisted programs BEFORE it is signed or simulated.
    console.log('\n[Step 2b/3] Verifying the Jupiter swap transaction...');
    const { feePayer, programIds } = await verifyJupiterSwapTx(swapTx, adminKeypair.publicKey);
    console.log(`  fee payer: ${feePayer} (admin key ✓)`);
    console.log(`  programs : ${programIds.join(', ')}`);

    // Simulate before signing so a reverting route costs nothing.
    await simulateVersioned(swapTx, 'Jupiter swap');

    // Measure the SKR balance immediately before the swap. A failed read here is
    // fatal: without it we cannot compute the burn delta.
    const preSwapBalance = await getTokenBalanceStrict(adminSkrAta);
    console.log(`  admin SKR before swap: ${preSwapBalance.amount} base units`);

    if (dryRun) {
      console.log('\n[dry-run] Swap verified and simulated but NOT sent. No transaction was broadcast.');
      console.log(`[dry-run] Would burn approximately ${expectedSkr} SKR (quote outAmount;`);
      console.log('[dry-run] the real burn uses the measured post-swap balance delta).');
      return;
    }

    swapTx.sign([adminKeypair]);
    console.log('Broadcasting swap transaction to Solana network...');
    const rawSwapTx = swapTx.serialize();
    const swapSig = await conn.sendRawTransaction(rawSwapTx, {
      skipPreflight: false,
      maxRetries: 3,
    });
    console.log(`Swap broadcasted. Awaiting confirmation... Tx: ${swapSig}`);
    await conn.confirmTransaction(swapSig, 'confirmed');
    console.log(`✅ DEX Swap successful! Bought SKR via Jupiter.`);

    // Step 3: Burn ONLY what this swap acquired.
    console.log('\n[Step 3/3] Measuring acquired SKR and executing burn...');
    await new Promise((r) => setTimeout(r, 1500));
    const postSwapBalance = await getTokenBalanceStrict(adminSkrAta);
    const skrToBurnUnits = postSwapBalance.amount - preSwapBalance.amount;

    console.log(`  admin SKR after swap:  ${postSwapBalance.amount} base units`);
    console.log(`  acquired by this swap: ${skrToBurnUnits} base units`);

    if (skrToBurnUnits <= 0n) {
      console.error(
        'Error: the swap did not increase the admin SKR balance ' +
          `(before ${preSwapBalance.amount}, after ${postSwapBalance.amount}). ` +
          'Nothing to burn — refusing to burn pre-existing balance.'
      );
      process.exit(1);
    }

    const burnUi = Number(skrToBurnUnits) / 1e6;
    console.log(`Burning ${burnUi.toLocaleString()} SKR (${skrToBurnUnits.toString()} base units)...`);

    const burnTx = new Transaction().add(
      createBurnInstruction(adminSkrAta, SKR_MINT, adminKeypair.publicKey, skrToBurnUnits)
    );
    const burnSig = await sendLegacy(burnTx, 'SKR burn');

    console.log('\n🎉 SUCCESS! Buy & Burn Complete!');
    console.log(`Total SKR Burned:       ${burnUi.toLocaleString()} SKR`);
    console.log(`Swap Solscan:           https://solscan.io/tx/${swapSig}`);
    console.log(`Burn Solscan:           https://solscan.io/tx/${burnSig}`);
    console.log('SKR Total Supply has been permanently decreased on Solana.');
  }
}

main().catch((err) => {
  console.error('\n❌ Execution Error:', err.message || err);
  process.exit(1);
});
