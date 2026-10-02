import fs from 'fs';
import crypto from 'crypto';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction, ComputeBudgetProgram,
} from '@solana/web3.js';
import { execSync } from 'child_process';
import { assertCluster, normalizeCluster, GENESIS_HASHES } from '../../scripts/lib/cluster-guard.mjs';

async function sendTxWithRetry(instructions, signers) {
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
  for (const ix of instructions) tx.add(ix);
  tx.feePayer = keypair.publicKey;

  let attempts = 0;
  while (attempts < 6) {
    try {
      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      const sig = await sendAndConfirmTransaction(conn, tx, signers, {
        commitment: 'confirmed',
        maxRetries: 5,
      });
      return sig;
    } catch (e) {
      attempts++;
      console.warn(`Transaction attempt ${attempts} failed (${e.message || e}), retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error(`Transaction failed after ${attempts} attempts`);
}

// No @solana/spl-token dependency: the ATA helpers are hand-rolled (the same
// derivation the mobile app uses) so the script runs on a bare checkout.
function getAssociatedTokenAddress(mint, owner) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROGRAM
  );
  return address;
}
function createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint) {
  return new TransactionInstruction({
    programId: ASSOC_TOKEN_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

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
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_MAINNET_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const SKR_MINT = new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const BPF_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const ORACLE_SEED = Buffer.from('oracle');
const POOL_SEED = Buffer.from('pool');
const VAULT_SEED = Buffer.from('vault');
const ADMIN_SEED = Buffer.from('admin');
const TREASURY_SEED = Buffer.from('treasury');

// ---------------------------------------------------------------------------
// Cluster handling — ONE explicit cluster variable.
//
// Previously this was split: web3.js talked to RPC (env-derived) while the
// solana CLI talked to SOLANA_CLUSTER (defaulting to the RPC string), so the two
// halves of a deploy could disagree about which cluster they were touching. Now
// a single CLUSTER value drives both, and getGenesisHash proves the endpoint
// really is that cluster before anything is signed or any CLI command runs.
// ---------------------------------------------------------------------------
const DEFAULT_RPC = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};
const _clusterFlagIdx = process.argv.indexOf('--cluster');
const CLUSTER = normalizeCluster(
  (_clusterFlagIdx !== -1 ? process.argv[_clusterFlagIdx + 1] : null) ||
    process.env.SOLANA_CLUSTER ||
    process.env.CLUSTER ||
    'mainnet-beta'
);
if (!GENESIS_HASHES[CLUSTER]) {
  throw new Error(`Unknown cluster "${CLUSTER}" — expected mainnet-beta or devnet.`);
}
const USDC_MINT = CLUSTER === 'devnet' ? USDC_DEVNET_MINT : USDC_MAINNET_MINT;
const _rpcFlagIdx = process.argv.indexOf('--rpc');
const RPC = (_rpcFlagIdx !== -1 ? process.argv[_rpcFlagIdx + 1] : null) ||
  process.env.MAINNET_RPC || process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL ||
  DEFAULT_RPC[CLUSTER];
const keypairPath = process.env.DEPLOYER_KEY || `${process.env.HOME}/.config/solana/mainnet-deployer.json`;
const keeperKeyPath = process.env.ORACLE_KEY || `${process.env.HOME}/.config/solana/mainnet-keeper.json`;
// The solana CLI subprocesses use the SAME resolved endpoint as web3.js.
const CLI_NETWORK = RPC;
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))));
const conn = new Connection(RPC, 'confirmed');

const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * ProgramData layout for BPFLoaderUpgradeab1e:
 *   [0..4)   u32 LE enum tag (3 == ProgramData)
 *   [4..12)  u64 LE slot
 *   [12]     Option<Pubkey> discriminant (1 == Some)
 *   [13..45) upgrade authority
 *   [45..)   program bytecode (zero-padded to the historical max allocation)
 *
 * Verification slices exactly `data[45 .. 45 + localSize]`; bytes past that are
 * retained zero padding and must NOT be included in the hash.
 */
async function verifyDeployedProgram(soPath, expectedProgramId) {
  const [programDataPda] = PublicKey.findProgramAddressSync([expectedProgramId.toBuffer()], BPF_LOADER);
  const acc = await conn.getAccountInfo(programDataPda);
  if (!acc) throw new Error(`ProgramData account ${programDataPda.toBase58()} not found on ${CLUSTER}`);
  const data = Buffer.from(acc.data);
  if (data.length < 45) throw new Error('ProgramData account is too small to contain an ELF header');

  const localSize = fs.statSync(soPath).size;
  const localHash = sha256File(soPath);
  if (data.length < 45 + localSize) {
    throw new Error(
      `ProgramData holds ${data.length - 45} bytecode bytes but the local ELF is ${localSize} bytes — ` +
        'the on-chain allocation is too small (run `solana program extend` first).'
    );
  }
  const onchainHash = sha256(data.subarray(45, 45 + localSize));

  const optionFlag = data[12];
  const upgradeAuthority = optionFlag === 1 ? new PublicKey(data.subarray(13, 45)).toBase58() : '(none — immutable)';

  const match = onchainHash === localHash;
  console.log('\n--- On-chain verification ---');
  console.log(`  ProgramData:       ${programDataPda.toBase58()} (${data.length} bytes allocated)`);
  console.log(`  upgrade authority: ${upgradeAuthority}`);
  console.log(`  on-chain sha256:   ${onchainHash}`);
  console.log(`  local sha256:      ${localHash}`);
  console.log(`  ${match ? '✅ MATCH — the deployed bytecode is byte-identical to the local build.' : '❌ MISMATCH — the deployed bytecode differs from the local build.'}`);
  return { match, onchainHash, localHash, upgradeAuthority, allocatedBytes: data.length };
}

const w64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const w64s = (n) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };

// Resolve the program-id keypair. A FIRST deploy (the program account does not
// exist on the cluster) requires the keypair for the program id — the CLI
// rejects a bare address for initial deployments. Upgrades accept an address.
function resolveProgramKeypairPath() {
  const candidates = [
    process.env.PROGRAM_KEYPAIR,
    `${process.env.HOME}/.config/solana/clock-lend-program.json`,
    new URL('../../program/target/deploy/clock_lend-keypair.json', import.meta.url).pathname,
  ].filter(Boolean);
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const pub = execSync(`solana-keygen pubkey ${p}`, { encoding: 'utf8' }).trim();
      if (pub === PROGRAM_ID.toBase58()) return p;
    } catch (_e) { /* try next candidate */ }
  }
  return undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const skrPrice = parseFloat(args[args.indexOf('--skr-price') + 1] || '0');
  const createPool = args.includes('--create-pool');
  const rotateOracle = args.includes('--rotate-oracle');
  const bufferArg = args.indexOf('--buffer') !== -1 ? args[args.indexOf('--buffer') + 1] : process.env.BUFFER;
  // --upgrade is REQUIRED to touch an existing program account; see the branch below.
  const upgrade = args.includes('--upgrade');
  const unknown = args.filter((a) => a.startsWith('--') && ![
    '--create-pool', '--rotate-oracle', '--skr-price', '--skip-build', '--buffer',
    '--upgrade', '--cluster', '--rpc',
  ].includes(a));
  if (unknown.length) throw new Error(`Unknown flags: ${unknown.join(', ')}`);

  console.log(`Cluster: ${CLUSTER}`);
  console.log(`RPC:     ${RPC}`);
  // Prove the endpoint is the cluster we think it is before spending anything.
  // Fail closed: a mismatch here would deploy mainnet bytecode to devnet (or
  // vice versa) while every log line claims the other cluster.
  const genesis = await assertCluster(conn, CLUSTER);
  console.log(`Genesis: ${genesis} (matches ${CLUSTER})`);

  // C-3 preflight: fail BEFORE spending lamports if the program-id keypair is
  // not on this machine (first deploy) — the CLI's error comes only after the
  // write-buffer step, which wastes rent and leaves a partial bootstrap.
  const programKeypairPath = resolveProgramKeypairPath();
  const programExists = await (async () => {
    try { return !!(await conn.getAccountInfo(PROGRAM_ID)); } catch (_e) { return false; }
  })();
  if (!programExists && !programKeypairPath) {
    throw new Error(
      `Program account ${PROGRAM_ID.toBase58()} does not exist on ${CLI_NETWORK} and no keypair for it ` +
      'was found (checked PROGRAM_KEYPAIR, ~/.config/solana/clock-lend-program.json, ' +
      'program/target/deploy/clock_lend-keypair.json). Recover the keypair from backup and set ' +
      'PROGRAM_KEYPAIR=/path/to/keypair.json — or pick a new program id and update lib.rs/program.ts.'
    );
  }

  // 1. Deploy the program (write-buffer + upgrade) — same program id on mainnet
  const soPath = new URL('../../program/target/deploy/clock_lend.so', import.meta.url).pathname;

  // C-3 (round 9): build + freshness preflight. Shipping a stale ELF silently
  // omits whatever the sources gained since the last build. Hard-fail unless --skip-build is passed.
  const skipBuild = args.includes('--skip-build');
  if (!skipBuild) {
    console.log('Building the program from source (cargo build-sbf)...');
    execSync(`cd ${new URL('../../program', import.meta.url).pathname} && cargo build-sbf`, { stdio: 'inherit' });
  }
  if (!fs.existsSync(soPath)) {
    throw new Error(`${soPath} not found — run: cd program && cargo build-sbf`);
  }
  const soStat = fs.statSync(soPath);
  let newestSource = 0;
  for (const dir of ['src']) {
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.[a-z]+$/i.test(e.name)) newestSource = Math.max(newestSource, fs.statSync(p).mtimeMs);
      }
    };
    const root = new URL(`../../program/${dir}`, import.meta.url).pathname;
    if (fs.existsSync(root)) walk(root);
  }
  const tomlPath = new URL('../../program/Cargo.toml', import.meta.url).pathname;
  const lockPath = new URL('../../program/Cargo.lock', import.meta.url).pathname;
  newestSource = Math.max(newestSource, fs.statSync(tomlPath).mtimeMs);
  if (fs.existsSync(lockPath)) newestSource = Math.max(newestSource, fs.statSync(lockPath).mtimeMs);
  if (soStat.mtimeMs < newestSource) {
    throw new Error(
      `${soPath} is OLDER than the program sources — a stale build would ship silently. ` +
      'Rebuild (cargo build-sbf) or pass --skip-build only if you are certain.'
    );
  }
  const soMd5 = execSync(`md5sum ${soPath}`, { encoding: 'utf8' }).split(' ')[0];
  console.log(`Artifact: ${soPath} (${soStat.size} bytes, md5 ${soMd5})`);

  if (programExists) {
    // ---------------------------------------------------------------------
    // UPGRADE PATH.
    //
    // Previously this branch printed "skipping deploy step" and moved on, so a
    // run against an existing program silently did NOT ship the new build while
    // still printing "MAINNET BOOTSTRAP COMPLETE". Any run that intends to change
    // deployed bytecode must now say so explicitly with --upgrade.
    //
    // Known CLI quirk: plain `solana program deploy <file>` can appear to no-op
    // on an existing upgradeable program. The reliable path is to write a new
    // buffer and deploy with `--program-id ... --buffer ...`.
    // ---------------------------------------------------------------------
    if (!upgrade) {
      console.log(
        `\nProgram already deployed at ${PROGRAM_ID.toBase58()} on ${CLUSTER}.\n` +
          'Pass --upgrade to write a new buffer and upgrade the deployed program, or\n' +
          'remove the existing program first. Refusing to silently skip the deploy step.'
      );
      console.log('Skipping the deploy step (no --upgrade given).');
    } else {
      const [programDataPda] = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_LOADER);
      const pdAcc = await conn.getAccountInfo(programDataPda);
      if (!pdAcc) throw new Error(`ProgramData ${programDataPda.toBase58()} not found — cannot upgrade.`);
      const allocated = pdAcc.data.length - 45;
      console.log(
        `\nUpgrading ${PROGRAM_ID.toBase58()} on ${CLUSTER}.\n` +
          `  current on-chain bytecode: ${allocated} bytes\n` +
          `  local ELF:                 ${soStat.size} bytes`
      );

      // BPFLoaderUpgradeable requires each ExtendProgram to add at least
      // 10,240 bytes (or extend to max size), so round the growth up to a
      // whole number of 10,240-byte steps and loop.
      if (soStat.size > allocated) {
        const MIN_EXTEND = 10240;
        const rawNeeded = soStat.size - allocated;
        const total = Math.ceil(rawNeeded / MIN_EXTEND) * MIN_EXTEND;
        console.log(
          `Local ELF is larger than the current allocation by ${rawNeeded} bytes — ` +
            `extending ProgramData by ${total} bytes (rounded up to whole ${MIN_EXTEND}-byte steps)...`
        );
        let remaining = total;
        while (remaining > 0) {
          const chunk = Math.min(MIN_EXTEND, remaining);
          console.log(`  solana program extend +${chunk}`);
          execSync(
            `solana program extend --url "${CLI_NETWORK}" --keypair ${keypairPath} ${PROGRAM_ID.toBase58()} ${chunk}`,
            { stdio: 'inherit' }
          );
          remaining -= chunk;
        }
      }

      const upgradeBufferPath = process.env.BUFFER_KEYPAIR || `${process.env.HOME}/.config/solana/mainnet-buffer.json`;
      console.log(`Writing new program buffer using keypair ${upgradeBufferPath}...`);
      execSync(
        `solana program write-buffer --url "${CLI_NETWORK}" --keypair ${keypairPath} ` +
          `--buffer ${upgradeBufferPath} --use-rpc --with-compute-unit-price 50000 --max-sign-attempts 20 ${soPath}`,
        { stdio: 'inherit' }
      );
      const upgradeBuffer = execSync(`solana-keygen pubkey ${upgradeBufferPath}`, { encoding: 'utf8' }).trim();
      console.log(`Buffer written: ${upgradeBuffer}`);

      console.log(`Deploying upgrade to ${PROGRAM_ID.toBase58()}...`);
      execSync(
        `solana program deploy --url "${CLI_NETWORK}" --keypair ${keypairPath} ` +
          `--program-id ${PROGRAM_ID.toBase58()} --buffer ${upgradeBuffer} --use-rpc --with-compute-unit-price 5000`,
        { stdio: 'inherit' }
      );

      // A successful `solana program deploy` exit code is NOT sufficient proof —
      // hash the ProgramData bytecode and compare it to the local artifact.
      const verification = await verifyDeployedProgram(soPath, PROGRAM_ID);
      if (!verification.match) {
        throw new Error(
          'Upgrade reported success but the on-chain bytecode does not match the local build. ' +
            'Do NOT treat this deploy as complete — investigate before running anything else.'
        );
      }
      console.log('Upgrade verified: on-chain bytecode matches the local build.');
    }
  } else {
    let buffer = bufferArg;
    if (!buffer) {
      // Dynamic rent preflight: calculate exact required rent for the ProgramData buffer (size + 45 bytes header)
      // plus 0.1 SOL buffer for write-buffer transaction fees and priority fees.
      const requiredRent = await conn.getMinimumBalanceForRentExemption(soStat.size + 45);
      const deployFloor = requiredRent + 100_000_000;
      const balance = await conn.getBalance(keypair.publicKey);
      console.log(`Deployer ${keypair.publicKey.toBase58()} balance: ${(balance / 1e9).toFixed(4)} SOL (min needed: ${(deployFloor / 1e9).toFixed(4)} SOL, rent: ${(requiredRent / 1e9).toFixed(4)} SOL)`);
      if (balance < deployFloor) {
        throw new Error(
          `Insufficient SOL — deployer has ${(balance / 1e9).toFixed(4)} SOL, but required rent is ${(requiredRent / 1e9).toFixed(4)} SOL ` +
          `(${(deployFloor / 1e9).toFixed(4)} SOL needed with tx buffer). Fund the deployer wallet first.`
        );
      }

      const bufferKeypairPath = process.env.BUFFER_KEYPAIR || `${process.env.HOME}/.config/solana/mainnet-buffer.json`;
      console.log(`Writing program buffer using keypair ${bufferKeypairPath}...`);
      const bufCmd = `solana program write-buffer --url "${CLI_NETWORK}" --keypair ${keypairPath} --buffer ${bufferKeypairPath} --use-rpc --with-compute-unit-price 50000 --max-sign-attempts 20 ${soPath}`;
      execSync(bufCmd, { stdio: 'inherit' });
      buffer = execSync(`solana-keygen pubkey ${bufferKeypairPath}`, { encoding: 'utf8' }).trim();
      console.log(`Program buffer written: ${buffer}`);
    } else {
      console.log(`Using existing on-chain program buffer: ${buffer}`);
    }

    console.log('Deploying program...');
    const programIdArg = programKeypairPath || PROGRAM_ID.toBase58();
    execSync(`solana program deploy --url "${CLI_NETWORK}" --keypair ${keypairPath} --program-id ${programIdArg} --buffer ${buffer} --use-rpc --with-compute-unit-price 5000`, { stdio: 'inherit' });

    // First deploy: verify the same way an upgrade is verified.
    const verification = await verifyDeployedProgram(soPath, PROGRAM_ID);
    if (!verification.match) {
      throw new Error(
        'Deploy reported success but the on-chain bytecode does not match the local build. ' +
          'Do NOT treat this deploy as complete — investigate before running anything else.'
      );
    }
    console.log('Deploy verified: on-chain bytecode matches the local build.');
  }

  // 2. InitializeAdmin (sole root = on-chain upgrade authority via ProgramData)
  const [adminPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], PROGRAM_ID);
  const [programDataPda] = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_LOADER);
  console.log('Initializing AdminConfig...');
  await sendTxWithRetry([new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: adminPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programDataPda, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([13]), // InitializeAdmin (tag 13)
  })], [keypair]);
  console.log(`Admin initialized: ${adminPda.toBase58()}`);

  // 2b. Optional: rotate the oracle authority to a separate, lower-privilege
  // keeper key so the price keeper never needs the full admin/upgrade key.
  // InitializeAdmin's rotation is authorized by the upgrade-authority proof
  // above; trailing accounts [new_admin, new_oracle] set the roles.
  if (rotateOracle) {
    const keeperPubkey = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(keeperKeyPath, 'utf8')))
    ).publicKey;
    console.log(`Rotating oracle_authority to keeper key ${keeperPubkey.toBase58()}...`);
    await sendTxWithRetry([new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true }, // writable: first-time feed creation pays rent
        { pubkey: adminPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: programDataPda, isSigner: false, isWritable: false },
        { pubkey: keypair.publicKey, isSigner: false, isWritable: false }, // keep admin
        { pubkey: keeperPubkey, isSigner: false, isWritable: false },     // new oracle authority
      ],
      data: Buffer.from([13]), // InitializeAdmin (rotation)
    })], [keypair]);
    console.log('oracle_authority rotated. Keeper may sign feeds with the keeper key only.');
  }

  // 3. Create the treasury USDC token account (owner = treasury PDA)
  const [treasuryPda] = PublicKey.findProgramAddressSync([TREASURY_SEED], PROGRAM_ID);
  const treasuryAta = await getAssociatedTokenAddress(USDC_MINT, treasuryPda);
  console.log('Creating treasury USDC ATA...');
  await sendTxWithRetry([
    createAssociatedTokenAccountIdempotentInstruction(
      keypair.publicKey, treasuryAta, treasuryPda, USDC_MINT
    )
  ], [keypair]);
  console.log(`Treasury USDC ATA: ${treasuryAta.toBase58()}`);

  // 4. Publish the global SOL price feed (Jupiter first, CoinGecko fallback)
  const solUsd = await fetchJupUsdPrice(NATIVE_MINT.toBase58()).catch(() => fetchUsdPrice('solana'));
  console.log(`Publishing SOL feed at $${solUsd}...`);
  await setFeed(NATIVE_MINT, Math.round(solUsd * 1e6), 9, adminPda);

  // 5. Publish the SKR feed — Jupiter market price by default (SKR is listed
  // at jup.ag/tokens/SKRbvo6Gf…), --skr-price overrides manually.
  const skrUsd = skrPrice > 0
    ? skrPrice
    : await fetchJupUsdPrice(SKR_MINT.toBase58()).catch(() => 0);
  if (skrUsd > 0) {
    console.log(`Publishing SKR feed at $${skrUsd}...`);
    await setFeed(SKR_MINT, Math.round(skrUsd * 1e6), 6, adminPda);
  } else {
    console.log('SKR feed skipped — no Jupiter price and no --skr-price override.');
  }

  // 6. Optionally create the first desk (mainnet USDC)
  if (createPool) {
    const poolId = 1n;
    const [poolPda] = PublicKey.findProgramAddressSync(
      [POOL_SEED, keypair.publicKey.toBuffer(), w64(poolId)], PROGRAM_ID);
    const [vaultPda] = PublicKey.findProgramAddressSync([VAULT_SEED, poolPda.toBuffer()], PROGRAM_ID);
    const name = Buffer.alloc(32);
    Buffer.from('Seeker Genesis Circle').copy(name);
    const data = Buffer.concat([
      Buffer.from([0]), w64(poolId), Buffer.from([1]), u16(350), u16(7000),
      w64s(3 * 86400), w64s(30 * 86400), name,
      Buffer.from([0]), // is_oracle_free: false — require a live oracle (63rd byte, added in F7)
    ]);
    console.log('Creating "Seeker Genesis Circle" desk...');
    await sendTxWithRetry([new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    })], [keypair]);
    console.log(`Desk created: ${poolPda.toBase58()}`);
  }

  // 7. Initialize the SKR yield vault (admin-gated, tag 15). The vault funds
  // itself via the 50/50 origination-fee split once the app appends its PDAs.
  console.log('Initializing SKR yield vault (reward mint = USDC)...');
  {
    const [yieldVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('skr_yield_vault'), USDC_MINT.toBuffer()], PROGRAM_ID);
    const [yieldTokenPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('skr_yield_token'), USDC_MINT.toBuffer()], PROGRAM_ID);
    await sendTxWithRetry([new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: yieldVaultPda, isSigner: false, isWritable: true },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: yieldTokenPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: adminPda, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([15]),
    })], [keypair]);
    console.log(`SkrYieldVault: ${yieldVaultPda.toBase58()} (token ${yieldTokenPda.toBase58()})`);
  }

  console.log('\nMAINNET BOOTSTRAP COMPLETE');
  console.log('Pricing is ADMIN-FEED-ONLY (Pyth removed): the feeds just published are the sole');
  console.log('price source, bound to 600s freshness. GET THE KEEPER RUNNING NOW:');
  console.log('  cd serverless && ORACLE_KEY=~/.config/solana/mainnet-keeper.json node src/cli.mjs');
  console.log('Schedule it at <10-minute cadence (cron or .github/workflows/keeper.yml) or borrows');
  console.log('revert with StaleOraclePrice after 600s.');
}

async function setFeed(mint, priceMicroUsd, decimals, adminPda) {
  const [oraclePda] = PublicKey.findProgramAddressSync([ORACLE_SEED, mint.toBuffer()], PROGRAM_ID);
  const data = Buffer.concat([Buffer.from([12]), w64(priceMicroUsd), Buffer.from([decimals])]);
  await sendTxWithRetry([new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true }, // writable: first-time feed creation pays rent
      { pubkey: oraclePda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: adminPda, isSigner: false, isWritable: false },
    ],
    data,
  })], [keypair]);
  console.log(`Feed set: ${oraclePda.toBase58()} = ${priceMicroUsd} micro-USD (${decimals} decimals)`);
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

main().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
