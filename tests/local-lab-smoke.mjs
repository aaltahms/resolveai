// Requires the local app and lab; deliberately stops/restarts only the lab service.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4318';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f) {
  for (let i = 0; i < 30; i++) {
    const d = await (await fetch(base + '/state')).json();
    if (f(d)) return d;
    await pause(1000);
  }
  throw Error('Timed out waiting for lab transition');
}
await waitFor((d) => d.samples[0]?.ok && !d.state.down);
assert.equal(
  (
    await fetch(base + '/stop', {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example' },
    })
  ).status,
  403,
);
const before = await (await fetch(base + '/state')).json();
await fetch(base + '/stop', { method: 'POST', headers: { Origin: base } });
try {
  const outage = await waitFor(
    (d) => d.state.down && d.incidentId && d.incidentId !== before.incidentId,
  );
  await pause(3000);
  assert.equal(
    (await (await fetch(base + '/state')).json()).incidentId,
    outage.incidentId,
  );
  await fetch(base + '/start', { method: 'POST', headers: { Origin: base } });
  const recovered = await waitFor(
    (d) =>
      !d.state.down &&
      d.events.some((e) => e.message.startsWith('Recovery checked')),
  );
  assert.equal(recovered.incidentId, outage.incidentId);
  assert.equal(recovered.syncError, '');
  console.log(
    JSON.stringify({
      passed: true,
      realOutage: true,
      incidentCreated: true,
      sameIncidentRecovered: true,
      crossOriginControlsBlocked: true,
    }),
  );
} finally {
  await fetch(base + '/start', { method: 'POST', headers: { Origin: base } });
}
