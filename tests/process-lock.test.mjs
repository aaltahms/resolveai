import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../local-lab/process-lock.mjs';
test('a second process cannot acquire ownership; SIGKILL releases the lock', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'resolveai-lock-')),
    path = join(directory, 'owner.sqlite');
  const moduleURL = new URL('../local-lab/process-lock.mjs', import.meta.url)
    .href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {acquireProcessLock} from ${JSON.stringify(moduleURL)}; acquireProcessLock(process.argv[1]); process.send('ready'); setInterval(()=>{},1000);`,
      path,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  try {
    await once(child, 'message');
    assert.throws(() => acquireProcessLock(path), /Another inventory monitor/);
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    const release = acquireProcessLock(path);
    release();
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    rmSync(directory, { recursive: true, force: true });
  }
});
