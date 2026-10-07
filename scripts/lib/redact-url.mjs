// Shared credential scrubber for the ops scripts.
//
// The scripts print their RPC endpoint on startup, and a production endpoint
// carries an API key. Anything printed lands in terminal scrollback, CI logs and
// shell history, so it is redacted before it is logged.
//
// Mirrors `redactUrl` in serverless/src/index.ts — keep the two in step (the
// codebase already accepts this kind of mirrored helper: see the
// `assertExpectedCluster` comment there, which mirrors cluster-guard.mjs).
//
// Query parameters alone are not enough. Providers also embed the credential in
// the PATH (Alchemy `.../v2/<KEY>`, QuickNode `https://<host>/<TOKEN>/`) or in
// userinfo (`https://user:pass@host`), and those forms survive a param-only
// scrub untouched.
const REDACTED = 'REDACTED';

export function redactUrl(raw) {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.username) u.username = REDACTED;
    if (u.password) u.password = REDACTED;
    for (const k of Array.from(u.searchParams.keys())) {
      if (/key|token|secret|auth|pass/i.test(k)) u.searchParams.set(k, REDACTED);
    }
    // Short path segments (`v2`, `rpc`) are structural and kept; anything long
    // enough to be a real secret is replaced wholesale.
    u.pathname = u.pathname
      .split('/')
      .map((seg) => (seg.length >= 16 ? REDACTED : seg))
      .join('/');
    return u.toString();
  } catch {
    return '(unparseable RPC URL)';
  }
}
