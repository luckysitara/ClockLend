#!/usr/bin/env node
// Scan TRACKED files for credential-shaped strings.
//
// There was no scanner in this repo, and it has already published a live Helius
// key — first through source, then through a tracked build artifact. Run this
// before committing, and in CI:
//
//   node scripts/secret-scan.mjs
//
// Only tracked files are read: a secret sitting in an untracked local file is
// not a repo leak. Exits 1 if anything looks like a live credential, so it can
// gate a PR.
//
// This complements, not replaces, `metro.config.js` (which fails the app BUNDLE)
// and the git-history sweep: patterns here catch credentials at rest, while the
// bundle gate catches the one route where an env var becomes published code.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const PATTERNS = [
  { name: 'Helius API key in URL', re: /helius-rpc\.com\/\?api-key=[A-Za-z0-9-]{20,}/i },
  { name: 'credential query parameter', re: /[?&](?:api-?key|token|secret|auth)=[A-Za-z0-9_\-.]{16,}/i },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Solana keypair byte array', re: /\[(?:\s*\d{1,3}\s*,){63}\s*\d{1,3}\s*\]/ },
];

// Values that are clearly redactions rather than secrets.
const PLACEHOLDER = /^(?:X{8,}|REDACTED|\$?\{?[A-Z_]*KEY\}?|YOUR[_-]?[A-Z_-]*|<[^>]*>|\.\.\.)$/i;

// Files that are generated, vendored, or expected to contain such strings.
const SKIP = [
  /^mobile\/android\/app\/src\/main\/assets\//, // build artifact (now untracked)
  /package-lock\.json$/,
  /Cargo\.lock$/,
  /\.min\.(?:js|css)$/,
  /secret-scan\.mjs$/, // this file contains the patterns themselves
];

function looksLikePlaceholder(match) {
  const eq = match.lastIndexOf('=');
  const value = (eq === -1 ? match : match.slice(eq + 1)).trim();
  return PLACEHOLDER.test(value);
}

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !SKIP.some((re) => re.test(f)));

const findings = [];
for (const file of files) {
  let body;
  try {
    body = fs.readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable
  }
  // Cheap pre-filter: skip files with no '=' / 'KEY' / 'key' at all.
  if (!/key|token|secret|PRIVATE/i.test(body)) continue;

  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of PATTERNS) {
      const m = lines[i].match(re);
      if (m && !looksLikePlaceholder(m[0])) {
        findings.push({ file, line: i + 1, name });
      }
    }
  }
}

if (findings.length === 0) {
  console.log(`secret-scan: clean (${files.length} tracked files scanned)`);
  process.exit(0);
}

console.error(`secret-scan: ${findings.length} potential credential(s) in tracked files:\n`);
for (const f of findings) {
  // Print the location and kind only — never the value itself, so the scanner
  // cannot become the leak (this is why the earlier audit sweep was count-only).
  console.error(`  ${f.file}:${f.line}  ${f.name}`);
}
console.error('\nIf this is a false positive, narrow the pattern or add the file to SKIP.');
console.error('If it is real: remove it, ROTATE THE KEY with the provider, and remember that');
console.error('deleting the text does not revoke it.');
process.exit(1);
