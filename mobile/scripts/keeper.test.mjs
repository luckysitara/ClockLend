/**
 * Regression tests for the keeper's post-update verification classifier.
 *
 * Run: node mobile/scripts/keeper.test.mjs
 *
 * No test framework: `mobile/` has none, and this must be runnable directly.
 * Exits non-zero on the first failure so it can gate CI.
 *
 * Why this exists: the keeper previously reported SUCCESS for a crank it could
 * not confirm. If the post-update read failed (RPC 429, timeout), the result
 * fell through to the success branch, the run exited 0, and the protocol could
 * sit stale for hours with a green keeper. `classifyPostUpdate` is the rule
 * that fixes that; these tests pin it.
 */
import assert from 'node:assert/strict';
import { classifyPostUpdate } from './keeper.mjs';

const cases = [
  // --- the bug: unconfirmable reads must NOT be 'ok' -----------------------
  ['null result (read threw outright)', null, 'unverified'],
  ['account missing after the write', { exists: false }, 'unverified'],
  ['account exists but read error', { exists: false, readError: '429 Too Many Requests' }, 'unverified'],
  ['undecodable account', { exists: true, decodable: false }, 'unverified'],
  ['decodable but never updated (age null)', { exists: true, decodable: true, ageSeconds: null }, 'unverified'],
  ['decodable but age undefined', { exists: true, decodable: true }, 'unverified'],

  // --- the original guard still holds ------------------------------------
  ['still past the 600s bound', { exists: true, decodable: true, ageSeconds: 601 }, 'stale'],
  ['far past the bound', { exists: true, decodable: true, ageSeconds: 32711 }, 'stale'],
  ['exactly at the bound (allowed)', { exists: true, decodable: true, ageSeconds: 600 }, 'ok'],

  // --- the happy path -----------------------------------------------------
  ['fresh', { exists: true, decodable: true, ageSeconds: 12 }, 'ok'],
  ['zero age', { exists: true, decodable: true, ageSeconds: 0 }, 'ok'],
];

let failures = 0;
for (const [name, input, expected] of cases) {
  const actual = classifyPostUpdate(input);
  try {
    assert.equal(actual, expected);
    console.log(`  ok   ${name} -> ${actual}`);
  } catch {
    failures++;
    console.error(`  FAIL ${name}: expected ${expected}, got ${actual}`);
  }
}

// The specific regression: a failed verification read must never be 'ok'.
const regression = classifyPostUpdate({ exists: false, readError: 'fetch failed' });
if (regression === 'ok') {
  failures++;
  console.error('  FAIL regression: an unreadable feed was classified as ok — the silent-success bug is back.');
}

console.log(`\n${cases.length + 1 - failures}/${cases.length + 1} passed`);
if (failures > 0) process.exit(1);
