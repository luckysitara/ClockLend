// Shared cluster guard for ClockLend money scripts.
//
// Every script that can move funds, burn tokens, rotate authority, or upgrade the
// program must prove which cluster its RPC endpoint is actually talking to before
// it signs anything. Pointing a mainnet-keyed script at a devnet RPC (or vice
// versa) is otherwise silent: the addresses are valid on both clusters and the
// wallet may exist on both.
//
// The two constants below are NOT from memory — they were captured with a live
// `getGenesisHash` call against each public endpoint and are re-verified by the
// scripts at runtime. To re-derive them yourself:
//
//   curl -s https://api.mainnet-beta.solana.com -X POST \
//     -H "Content-Type: application/json" \
//     -d '{"jsonrpc":"2.0","id":1,"method":"getGenesisHash"}'
//   curl -s https://api.devnet.solana.com -X POST \
//     -H "Content-Type: application/json" \
//     -d '{"jsonrpc":"2.0","id":1,"method":"getGenesisHash"}'

export const GENESIS_HASHES = {
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

/// Normalize the many spellings scripts accept into a canonical cluster name.
export function normalizeCluster(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'mainnet' || s === 'mainnet-beta' || s === 'mainnetbeta') return 'mainnet-beta';
  if (s === 'devnet' || s === 'testnet') return 'devnet';
  return s;
}

/**
 * Assert that `conn` is talking to `expectedCluster`.
 * Throws (callers must not catch) when the genesis hash disagrees.
 */
export async function assertCluster(conn, expectedCluster) {
  const expected = normalizeCluster(expectedCluster);
  const want = GENESIS_HASHES[expected];
  if (!want) {
    throw new Error(
      `Unknown cluster "${expectedCluster}" — expected one of: ${Object.keys(GENESIS_HASHES).join(', ')}`
    );
  }
  let actual;
  try {
    actual = await conn.getGenesisHash();
  } catch (e) {
    throw new Error(`Could not read genesis hash from the RPC endpoint: ${e.message || e}`);
  }
  if (actual !== want) {
    const other = Object.entries(GENESIS_HASHES).find(([, h]) => h === actual);
    throw new Error(
      `CLUSTER MISMATCH — refusing to continue.\n` +
        `  intended cluster: ${expected} (genesis ${want})\n` +
        `  RPC endpoint is : ${other ? other[0] : 'an unrecognized cluster'} (genesis ${actual})\n` +
        `  Fix RPC_URL / --cluster so both agree before re-running.`
    );
  }
  return actual;
}

/** Render the canonical cluster name for log lines. */
export function clusterLabel(cluster) {
  return normalizeCluster(cluster) || 'unknown';
}
