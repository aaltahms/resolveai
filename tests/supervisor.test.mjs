import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { supervise } from '../local-lab/supervisor.mjs';
const options = (signal) => ({
  command: process.execPath,
  signal,
  baseDelayMs: 5,
  maxDelayMs: 20,
  stableMs: 60000,
  stdio: 'ignore',
});
test('supervisor restarts a real failed process, then stops on clean completion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'resolveai-supervisor-')),
    file = join(dir, 'count');
  const controller = new AbortController(),
    restarts = [];
  try {
    const code = `const fs=require('node:fs');const f=process.argv[1];let n=0;try{n=Number(fs.readFileSync(f,'utf8'));}catch{}fs.writeFileSync(f,String(n+1));process.exit(n===0?17:0);`;
    const result = await supervise({
      ...options(controller.signal),
      args: ['-e', code, file],
      onRestart: (r) => restarts.push(r),
    });
    assert.equal(result.reason, 'completed');
    assert.equal(readFileSync(file, 'utf8'), '2');
    assert.equal(restarts.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('persistent failures stop at the configured restart limit with increasing delays', async () => {
  const restarts = [];
  const result = await supervise({
    ...options(new AbortController().signal),
    args: ['-e', 'process.exit(2)'],
    maxFailures: 3,
    onRestart: (r) => restarts.push(r),
  });
  assert.equal(result.reason, 'restart_limit');
  assert.equal(result.failures, 3);
  assert.deepEqual(
    restarts.map((r) => r.delayMs),
    [5, 10],
  );
});
test('stopping during backoff prevents another process from starting', async () => {
  const controller = new AbortController();
  let restarts = 0;
  const result = await supervise({
    ...options(controller.signal),
    args: ['-e', 'process.exit(2)'],
    onRestart: () => {
      restarts++;
      controller.abort();
    },
  });
  assert.equal(result.reason, 'stopped');
  assert.equal(restarts, 1);
});
test('stop terminates a running child instead of restarting it', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    const result = await supervise({
      ...options(controller.signal),
      args: ['-e', 'setInterval(()=>{},1000)'],
      stopGraceMs: 100,
    });
    assert.equal(result.reason, 'stopped');
    assert.equal(result.failures, 0);
  } finally {
    clearTimeout(timer);
  }
});
