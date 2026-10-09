/**
 * Regression tests for post-crank feed verification.
 *
 * Run: npm test   (or: node test/feeds.test.mjs)
 *
 * No test framework — `serverless/` has none, and this must be runnable directly.
 * Exits non-zero on the first failure so it can gate CI.
 *
 * Why this exists: `crankOracles` used to trust `confirmTransaction` and never
 * read the feeds back. A finalised transaction is not proof the accounts reached
 * the intended state, and it says nothing at all if the read-back is the thing
 * that failed. That gap let the mainnet feeds sit ~9 hours stale while the keeper
 * reported healthy cranks. `verifyFeedsAdvanced` is the fix; these tests pin it,
 * and they replace the equivalent suite that lived alongside the now-deleted
 * standalone `mobile/scripts/keeper.mjs`.
 */
import assert from 'node:assert/strict';
import { verifyFeedsAdvanced } from '../src/index.ts';

const PDA_A = 'FeedAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PDA_B = 'FeedBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

/** A 98-byte PriceFeed buffer with `last_updated_at` at offset 50. */
function feedData(updatedAt) {
  const b = Buffer.alloc(98);
  b.write('CLK_FEED', 0, 'ascii');
  b[8] = 1;
  b.writeBigInt64LE(BigInt(updatedAt), 50);
  return b;
}

/** Minimal Connection stub: only getAccountInfo is used by the function. */
function stubConn(responder) {
  const calls = [];
  return {
    calls,
    async getAccountInfo(pda) {
      calls.push(pda);
      return responder(pda, calls.length);
    },
  };
}

const SINCE = 1_800_000_000;
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}: ${e.message}`);
  }
}

// --- the write landed ------------------------------------------------------
await check('feed updated after the snapshot is confirmed', async () => {
  const conn = stubConn(() => ({ data: feedData(SINCE + 5) }));
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    1
  );
  assert.deepEqual(bad, []);
});

// --- the write did not land, or cannot be confirmed ------------------------
await check('a feed with identical timestamp (did not advance) is reported', async () => {
  const conn = stubConn(() => ({ data: feedData(SINCE) }));
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    1
  );
  assert.deepEqual(bad, ['SOL']);
});

await check('a feed with older timestamp is reported', async () => {
  const conn = stubConn(() => ({ data: feedData(SINCE - 10_000) }));
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    1
  );
  assert.deepEqual(bad, ['SOL']);
});

await check('the specific regression: an unreadable feed is unconfirmed', async () => {
  const conn = stubConn(() => null); // account missing, e.g. a 429 masking as empty
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    1
  );
  assert.deepEqual(bad, ['SOL'], 'a null read must never count as confirmed');
});

await check('a throwing read is unconfirmed, not swallowed', async () => {
  const conn = stubConn(() => {
    throw new Error('429 Too Many Requests');
  });
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    1
  );
  assert.deepEqual(bad, ['SOL']);
});

await check('a truncated account is unconfirmed', async () => {
  const conn = stubConn(() => ({ data: Buffer.alloc(10) }));
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    1
  );
  assert.deepEqual(bad, ['SOL']);
});

// --- reporting granularity -------------------------------------------------
await check('only the feed that failed is reported', async () => {
  const conn = stubConn((pda) => ({
    data: feedData(pda === PDA_A ? SINCE + 5 : SINCE),
  }));
  const bad = await verifyFeedsAdvanced(
    conn,
    [
      { pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE },
      { pda: PDA_B, label: 'SKR', priorUpdatedAt: SINCE },
    ],
    1
  );
  assert.deepEqual(bad, ['SKR']);
});

// --- retries ---------------------------------------------------------------
await check('a transient failure is retried and can still confirm', async () => {
  const conn = stubConn((_pda, n) => (n < 3 ? null : { data: feedData(SINCE + 5) }));
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    3
  );
  assert.deepEqual(bad, [], 'a read that succeeds on retry must confirm');
  assert.equal(conn.calls.length, 3, 'it should have retried twice before succeeding');
});

await check('retries are bounded', async () => {
  const conn = stubConn(() => null);
  const bad = await verifyFeedsAdvanced(
    conn,
    [{ pda: PDA_A, label: 'SOL', priorUpdatedAt: SINCE }],
    3
  );
  assert.deepEqual(bad, ['SOL']);
  assert.equal(conn.calls.length, 3, 'it must give up after `attempts`, not loop forever');
});

console.log(`\n${failures === 0 ? 'all tests passed' : `${failures} FAILED`}`);
if (failures > 0) process.exit(1);
