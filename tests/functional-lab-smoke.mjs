// Controlled integration evaluation; no AI calls. Requires local lab + ResolveAI.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:4318';
const read = async () => (await fetch(base + '/state')).json();
const control = async (action) => {
  const r = await fetch(base + '/' + action, {
    method: 'POST',
    headers: { Origin: base },
  });
  assert.equal(r.status, 204);
};
async function until(predicate) {
  for (let i = 0; i < 40; i++) {
    const d = await read();
    if (predicate(d)) return d;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('Timed out');
}
const results = [];
await control('restore');
await until((d) => d.samples[0]?.ok && !d.state.down);
try {
  for (const fault of ['readonly', 'slow']) {
    const before = await read();
    const started = Date.now();
    await control(fault);
    const failed = await until(
      (d) => d.state.down && d.incidentId && d.incidentId !== before.incidentId,
    );
    assert.match(failed.samples[0].detail, /health HTTP 200/);
    assert.match(
      failed.samples[0].detail,
      fault === 'readonly' ? /readonly|read.only/i : /Timeout/,
    );
    const detectedMs = Date.now() - started;
    const count = failed.records.count;
    await new Promise((r) => setTimeout(r, 2400));
    assert.equal((await read()).records.count, count);
    const recoveryStarted = Date.now();
    await control('restore');
    const restored = await until(
      (d) =>
        !d.state.down &&
        d.records.count > count &&
        d.events[0]?.message.startsWith('Recovery checked'),
    );
    assert.equal(restored.incidentId, failed.incidentId);
    assert.equal(restored.syncError, '');
    results.push({
      fault,
      passed: true,
      detectedMs,
      recoveredMs: Date.now() - recoveryStarted,
      evidence: failed.samples[0].detail,
      incidentId: failed.incidentId,
    });
  }
  writeFileSync(
    new URL('../local-lab/data/latest-evaluation.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await control('restore');
}
