import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStorage,
  parseProcesses,
  interpretStorage,
  interpretPerformance,
  cpuUsage,
  checkMac,
  runCommand,
} from '../local-lab/mac-checks.mjs';
test('storage rejects malformed output and distinguishes low space', () => {
  assert.equal(parseStorage('denied'), null);
  assert.equal(parseStorage('fs 100 1 200'), null);
  assert.match(interpretStorage(null).title, /could not/);
  assert.match(
    interpretStorage({ total: 500 * 1024 ** 3, available: 5 * 1024 ** 3 })
      .title,
    /low/,
  );
  assert.match(
    interpretStorage({ total: 500 * 1024 ** 3, available: 200 * 1024 ** 3 })
      .title,
    /room/,
  );
  assert.deepEqual(
    parseStorage('Filesystem 1024-blocks Used Available\n/dev/disk 100 60 40'),
    { total: 102400, available: 40960 },
  );
});
test('process parsing strips private paths and rejects malformed rows', () => {
  const result = parseProcesses(
    ' 123 150.5 2048 /Users/private/Applications/Example.app/Contents/MacOS/Example\nmalformed',
  );
  assert.deepEqual(result, [
    { pid: 123, cpu: 150.5, memory: 2097152, app: true, name: 'Example' },
  ]);
  assert.ok(!JSON.stringify(result).includes('/Users/'));
});
test('CPU calculations reject missing or inconsistent samples', () => {
  assert.equal(cpuUsage([], []), null);
  assert.equal(
    cpuUsage([{ idle: 0, total: 0 }], [{ idle: 25, total: 100 }]),
    75,
  );
  assert.equal(
    cpuUsage([{ idle: 0, total: 0 }], [{ idle: 0, total: 0 }]),
    null,
  );
});
test('pressure, high CPU, and missing evidence remain distinct', () => {
  assert.match(
    interpretPerformance({ cpu: 10, pressure: 4 }).title,
    /Memory pressure/,
  );
  const busy = interpretPerformance({ cpu: 99, pressure: null });
  assert.match(busy.title, /busy/);
  assert.match(busy.explanation, /not proof/);
  assert.match(
    interpretPerformance({ cpu: null, pressure: null }).title,
    /incomplete/,
  );
  assert.match(
    interpretPerformance({ cpu: 5, pressure: null }).explanation,
    /Unavailable/,
  );
});
test('read command has a fixed executable, bounded output and timeout', async () => {
  const result = await runCommand('pressure', (file, args, options, cb) => {
    assert.equal(file, '/usr/sbin/sysctl');
    assert.equal(options.timeout, 3000);
    assert.equal(options.maxBuffer, 262144);
    cb({ killed: true }, '');
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline/);
  assert.throws(() => runCommand('rm'));
});
test('denied access, partial data, unsupported OS and concurrent clicks', async () => {
  const denied = async () => ({ ok: false, reason: 'Access denied.' });
  const options = {
    platform: 'darwin',
    run: denied,
    sample: () => [],
    wait: async () => {},
  };
  const first = checkMac('apps', options);
  assert.equal(checkMac('apps', options), first);
  const result = await first;
  assert.match(result.title, /could not/);
  assert.match(result.evidence.join(' '), /Access denied/);
  assert.equal(result.processes.length, 0);
  const storage = await checkMac('storage', options);
  assert.match(storage.title, /could not/);
  const partial = await checkMac('performance', {
    ...options,
    run: async (name) =>
      name === 'pressure' ? { ok: true, text: '2\n' } : denied(),
  });
  assert.match(partial.title, /pressure/);
  assert.match((await checkMac('apps', { platform: 'linux' })).title, /macOS/);
});
