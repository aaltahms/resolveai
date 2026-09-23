import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { probeInventory } from '../local-lab/inventory-probe.mjs';
import { inventoryMonitor } from '../local-lab/inventory-monitor.mjs';
const app = 'http://127.0.0.1:3000';
const login = await fetch(app + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
async function api(path, body, method = 'POST') {
  const r = await fetch(app + path, {
    method: body ? method : 'GET',
    headers: {
      Cookie: cookie,
      Origin: app,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.ok(r.ok, d.error);
  return d;
}
const directory = new URL('../local-lab/data/', import.meta.url);
mkdirSync(directory, { recursive: true });
let child;
async function start(readOnly = false) {
  child = spawn(
    'python3',
    [
      fileURLToPath(
        new URL('../integrations/inventory/app.py', import.meta.url),
      ),
      '--database',
      fileURLToPath(new URL('inventory.sqlite', directory)),
      ...(readOnly ? ['--read-only'] : []),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let error = '';
  child.stderr.on('data', (d) => (error += d.toString()));
  for (let i = 0; i < 30; i++) {
    if (child.exitCode !== null)
      throw Error('Inventory failed to start: ' + error);
    try {
      if ((await fetch('http://127.0.0.1:4321/ready')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('Inventory startup timed out');
}
async function stop() {
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await ended;
  }
  child = undefined;
}
const report = { completed: false, at: new Date().toISOString(), aiCalls: 0 };
let creates = 0,
  recoveries = 0;
const monitor = inventoryMonitor({
  probe: probeInventory,
  createIncident: async (brief) => {
    creates++;
    return (
      await api('/api/tickets', {
        ...brief,
        source: 'reported',
        category: 'application',
        priority: 'P2',
        asset: 'Inventory continuous-monitor validation',
      })
    ).ticket;
  },
  recoverIncident: async (t, evidence) => {
    recoveries++;
    await api(
      '/api/tickets/' + t.id + '/work',
      {
        operation: 'comment',
        revision: t.revision,
        text:
          'Verified inventory recovery through independent create/read-back checks.\n' +
          evidence,
      },
      'PATCH',
    );
  },
});
try {
  await start();
  await monitor.tick();
  await stop();
  await start(true);
  for (let i = 0; i < 6; i++) await monitor.tick();
  assert.equal(creates, 1);
  assert.equal(monitor.snapshot().delivery, 'saved');
  const incidentId = monitor.snapshot().incidentId;
  await stop();
  await start();
  for (let i = 0; i < 5; i++) await monitor.tick();
  assert.equal(recoveries, 1);
  assert.equal(monitor.snapshot().delivery, 'recovered');
  const saved = (await api('/api/tickets')).tickets.find(
    (t) => t.id === incidentId,
  );
  assert.equal(saved.revision, 2);
  assert.match(saved.incident.evidence, /storage_unavailable/);
  Object.assign(report, { completed: true, creates, recoveries, incidentId });
  console.log(JSON.stringify(report));
} finally {
  await stop();
  writeFileSync(
    new URL('./inventory-continuous-results.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
