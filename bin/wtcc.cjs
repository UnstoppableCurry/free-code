#!/usr/bin/env node
// wtcc launcher shim — uses Node to detect Bun, then re-execs the TS entrypoint via `bun run`.
// Why Node shim instead of a Bun-compiled binary: @azure/identity uses dynamic import()
// which Bun's static bundler can't follow, so a shipped binary breaks at runtime.
// Shipping TS source + requiring Bun on the user side is the simplest correct path.

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PKG_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(PKG_ROOT, 'src', 'entrypoints', 'cli.tsx');

function findBun() {
  // 1. Try $PATH via `which`/`where`
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['bun'], {
    encoding: 'utf8',
  });
  if (probe.status === 0 && probe.stdout) {
    const first = probe.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first && fs.existsSync(first)) return first;
  }
  // 2. Common install locations
  const candidates = [
    path.join(process.env.HOME || '', '.bun', 'bin', 'bun'),
    '/usr/local/bin/bun',
    '/opt/homebrew/bin/bun',
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function bail() {
  const msg =
    'wtcc requires the Bun runtime.\n' +
    '\n' +
    'Install Bun:\n' +
    '  curl -fsSL https://bun.sh/install | bash\n' +
    '\n' +
    'Then make sure `bun` is on your PATH (usually ~/.bun/bin) and re-run `wtcc`.\n' +
    '\n' +
    'Docs: https://bun.sh  |  https://github.com/UnstoppableCurry/wtcc\n';
  process.stderr.write(msg);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(ENTRY)) {
    process.stderr.write(`wtcc: entrypoint missing at ${ENTRY}\n`);
    process.exit(1);
  }
  const bun = findBun();
  if (!bun) bail();

  const args = ['run', ENTRY, ...process.argv.slice(2)];
  const r = spawnSync(bun, args, { stdio: 'inherit' });
  if (r.error) {
    process.stderr.write(`wtcc: failed to spawn bun: ${r.error.message}\n`);
    process.exit(1);
  }
  if (r.signal) {
    process.kill(process.pid, r.signal);
    return;
  }
  process.exit(r.status == null ? 1 : r.status);
}

main();
