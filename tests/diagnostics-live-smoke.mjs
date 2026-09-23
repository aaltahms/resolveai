// Read-only smoke test. No faults, settings changes, AI calls, or repairs.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4318';
for (const path of [
  '/network/check',
  '/mac/performance',
  '/mac/storage',
  '/mac/apps',
  '/mac/external-drive',
  '/mac/drive-write',
  '/mac/printer-missing',
  '/mac/print-queue',
  '/mac/printer-default',
  '/mac/battery',
  '/mac/audio',
  '/mac/displays',
]) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { Origin: base },
    signal: AbortSignal.timeout(12000),
  });
  assert.equal(response.status, 200, path);
  const data = await response.json();
  for (const field of ['title', 'explanation', 'next', 'checkedAt'])
    assert.ok(data[field], `${path}: ${field}`);
  if (path === '/network/check') {
    assert.equal(data.sites.length, 2);
    assert.ok(
      data.sites.every(
        (s) => s.host === 'example.com' || s.host === 'www.apple.com',
      ),
    );
  }
  console.log(`${path}: ${data.title}`);
  const rejected = await fetch(base + path, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example' },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(rejected.status, 403);
}
assert.equal(
  (
    await fetch(base + '/mac/arbitrary-command', {
      method: 'POST',
      headers: { Origin: base },
    })
  ).status,
  404,
);
assert.equal((await fetch(base + '/mac/apps')).status, 403);
assert.equal((await fetch(base + '/lab')).status, 200);
console.log(
  'All twelve routes, origin rejection, unknown-command rejection, and lab availability verified.',
);
