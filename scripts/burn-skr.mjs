import fs from 'fs';
import path from 'path';

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
  sendAndConfirmTransaction,
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

const args = process.argv.slice(2);
const network = args.includes('--network')
  ? args[args.indexOf('--network') + 1]
  : (process.env.NETWORK || 'devnet');
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

async function getTokenBalanceSafe(ataPubkey) {
  try {
    const res = await conn.getTokenAccountBalance(ataPubkey);
    return {
      uiAmount: res.value.uiAmount || 0,
      amount: BigInt(res.value.amount || '0'),
      decimals: res.value.decimals,
    };
  } catch (_e) {
    return { uiAmount: 0, amount: 0n, decimals: 6 };
  }
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
  console.log('Admin Signer:  ', adminKeypair.publicKey.toBase58());
  console.log('Treasury PDA:  ', treasuryPda.toBase58());

  // Fetch Treasury Balances
  const treasurySolLamports = await conn.getBalance(treasuryPda);
  const treasurySolUi = treasurySolLamports / 1e9;
  const treasuryUsdc = await getTokenBalanceSafe(treasuryUsdcAta);
  const treasurySkr = await getTokenBalanceSafe(treasurySkrAta);

  console.log('\n--- Treasury Balances ---');
  console.log(`Native SOL:     ${treasurySolUi.toFixed(4)} SOL`);
  console.log(`USDC Balance:   $${treasuryUsdc.uiAmount.toFixed(2)} USDC (${treasuryUsdcAta.toBase58()})`);
  console.log(`SKR Balance:    ${treasurySkr.uiAmount.toLocaleString()} SKR (${treasurySkrAta.toBase58()})`);

  // If status only
  if (args.includes('--status') || args.length === 0) {
    console.log('\n📖 Execution Modes:');
    console.log('1. DIRECT BURN (Burn SKR already in Treasury PDA):');
    console.log('   node scripts/burn-skr.mjs --direct --amount 5000 --network mainnet');
    console.log('   node scripts/burn-skr.mjs --direct --pct 50 --network mainnet');
    console.log('\n2. BUY & BURN (Use Treasury USDC / SOL to buy SKR on Jupiter & burn):');
    console.log('   node scripts/burn-skr.mjs --buy --token usdc --amount 100 --network mainnet');
    console.log('   node scripts/burn-skr.mjs --buy --token usdc --pct 25 --network mainnet');
    console.log('   node scripts/burn-skr.mjs --buy --token sol --amount 1.5 --network mainnet');
    return;
  }

  const isDirect = args.includes('--direct');
  const isBuy = args.includes('--buy');

  if (!isDirect && !isBuy) {
    console.error('Error: Please specify either --direct (burn Treasury SKR) or --buy (buy SKR on DEX & burn).');
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

    console.log('Sending atomic withdraw-and-burn transaction...');
    const sig = await sendAndConfirmTransaction(conn, tx, [adminKeypair]);
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

    const withdrawSig = await sendAndConfirmTransaction(conn, withdrawTx, [adminKeypair]);
    console.log(`✅ Treasury withdrawal confirmed. Tx: ${withdrawSig}`);

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

    // Step 3: Burn the Acquired SKR Tokens
    console.log('\n[Step 3/3] Inspecting acquired SKR tokens and executing burn...');
    // Brief sleep to let ATA index on RPC
    await new Promise((r) => setTimeout(r, 1500));
    const finalSkrBalance = await getTokenBalanceSafe(adminSkrAta);
    const skrToBurnUnits = finalSkrBalance.amount;

    if (skrToBurnUnits === 0n) {
      console.error('Error: No SKR tokens found in admin account to burn.');
      process.exit(1);
    }

    const burnUi = Number(skrToBurnUnits) / 1e6;
    console.log(`Burning ${burnUi.toLocaleString()} SKR (${skrToBurnUnits.toString()} base units)...`);

    const burnTx = new Transaction().add(
      createBurnInstruction(adminSkrAta, SKR_MINT, adminKeypair.publicKey, skrToBurnUnits)
    );
    const burnSig = await sendAndConfirmTransaction(conn, burnTx, [adminKeypair]);

    console.log('\n🎉 SUCCESS! Buy & Burn Complete!');
    console.log(`Total SKR Burned:       ${burnUi.toLocaleString()} SKR`);
    console.log(`Swap Solscan:           https://solscan.io/tx/${swapSig}`);
    console.log(`Burn Solscan:           https://solscan.io/tx/${burnSig}`);
    console.log('SKR Total Supply has been permanently decreased on Solana.');
  }
}

main().catch((err) => {
  console.error('\n❌ Execution Error:', err);
  process.exit(1);
});
