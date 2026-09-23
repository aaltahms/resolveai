import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryMonitor } from '../local-lab/inventory-monitor.mjs';
const sample = (ok) => ({
  ok,
  requestId: crypto.randomUUID(),
  at: new Date().toISOString(),
  detail: ok
    ? 'created and retrieved'
    : 'Inventory readiness HTTP 200; create item HTTP 503; error=storage_unavailable',
});
test('continuous monitor creates once and recovers the same incident', async () => {
  let ok = false,
    created = 0,
    recovered = 0;
  const monitor = inventoryMonitor({
    probe: async () => sample(ok),
    createIncident: async (brief) => {
      created++;
      assert.match(brief.title, /creation fails/);
      return { id: 'one' };
    },
    recoverIncident: async (t) => {
      assert.equal(t.id, 'one');
      recovered++;
    },
  });
  for (let i = 0; i < 6; i++) await monitor.tick();
  assert.equal(created, 1);
  ok = true;
  for (let i = 0; i < 5; i++) await monitor.tick();
  assert.equal(recovered, 1);
  assert.equal(monitor.snapshot().delivery, 'recovered');
});
test('uncertain incident creation is reported and never blindly retried', async () => {
  let attempts = 0;
  const m = inventoryMonitor({
    probe: async () => sample(false),
    createIncident: async () => {
      attempts++;
      throw Error('connection lost');
    },
    recoverIncident: async () => assert.fail(),
  });
  for (let i = 0; i < 6; i++) await m.tick();
  assert.equal(attempts, 1);
  assert.equal(m.snapshot().delivery, 'uncertain');
  assert.match(m.snapshot().error, /not confirmed/);
});
test('overlapping probe ticks do not create concurrent deliveries', async () => {
  let finish,
    calls = 0;
  const m = inventoryMonitor({
    probe: () => {
      calls++;
      return new Promise((r) => {
        finish = r;
      });
    },
    createIncident: async () => assert.fail(),
    recoverIncident: async () => assert.fail(),
  });
  const running = m.tick();
  await m.tick();
  assert.equal(calls, 1);
  finish(sample(true));
  await running;
});
