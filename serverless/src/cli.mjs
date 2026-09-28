import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crankOracles, getOracleStatus } from './index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-load root .env or mobile/.env if present
function loadEnv() {
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../mobile/.env'),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !(m[1] in process.env)) {
          process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch (_) {}
  }
}
loadEnv();

// Check if Keypair file path is provided instead of raw key
if (!process.env.ORACLE_KEYPAIR) {
  const keyPath = process.env.ORACLE_KEY || process.env.KEEPER_KEY;
  if (keyPath && fs.existsSync(keyPath)) {
    process.env.ORACLE_KEYPAIR = fs.readFileSync(keyPath, 'utf8');
  }
}

async function run() {
  const isStatusOnly = process.argv.includes('--status') || process.argv.includes('-s');

  console.log('=== ClockLend Serverless Oracle CLI Runner ===');
  console.log('Network:', process.env.NETWORK || 'devnet');
  console.log('RPC:', process.env.RPC_URL || 'https://api.devnet.solana.com');

  if (isStatusOnly) {
    console.log('\nFetching on-chain oracle status...');
    const status = await getOracleStatus(process.env);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (!process.env.ORACLE_KEYPAIR) {
    console.error('\n❌ ERROR: ORACLE_KEYPAIR (or ORACLE_KEY file path) is required.');
    console.error('Set ORACLE_KEYPAIR in your environment or pass ORACLE_KEY=/path/to/keypair.json');
    process.exit(1);
  }

  console.log('\nExecuting oracle crank...');
  const result = await crankOracles(process.env);
  console.log('\n✅ Crank Succeeded:');
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error('\n❌ Execution Failed:', err.message || err);
  process.exit(1);
});
