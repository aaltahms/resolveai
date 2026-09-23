import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  probeInventory,
  inventoryBrief,
} from '../local-lab/inventory-probe.mjs';
import { observe } from '../local-lab/monitor.mjs';
import { incidentBrief } from '../local-lab/brief.mjs';
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
const report = { at: new Date().toISOString(), completed: false, aiCalls: 0 };
try {
  await start();
  const healthy = await probeInventory();
  assert.ok(healthy.ok);
  await stop();
  await start(true);
  let monitor = { failures: 0, successes: 0, down: false };
  const evidence = [];
  let transition;
  for (let i = 0; i < 3; i++) {
    const s = await probeInventory();
    assert.equal(s.ok, false);
    assert.match(s.detail, /readiness HTTP 200; create item HTTP 503/);
    evidence.push(s);
    const r = observe(monitor, s);
    monitor = r.state;
    transition = r.event;
  }
  assert.equal(transition, 'outage');
  const brief = incidentBrief(evidence);
  assert.equal(brief.classification, 'unknown');
  const created = await api('/api/tickets', {
    ...inventoryBrief(evidence),
    source: 'reported',
    category: 'application',
    priority: 'P2',
    asset: 'Independent inventory API',
    evidence: evidence
      .map((s) => `${s.at} request=${s.requestId} ${s.detail}`)
      .join('\n'),
  });
  await stop();
  await start();
  const recovered = [];
  for (let i = 0; i < 3; i++) {
    const s = await probeInventory();
    assert.ok(s.ok);
    recovered.push(s);
    const r = observe(monitor, s);
    monitor = r.state;
    transition = r.event;
  }
  assert.equal(transition, 'recovery');
  const updated = await api(
    '/api/tickets/' + created.ticket.id + '/work',
    {
      operation: 'comment',
      revision: created.ticket.revision,
      text:
        'Recovery verified: three new items were created and independently retrieved with matching contents.\n' +
        recovered.map((s) => s.detail).join('\n'),
    },
    'PATCH',
  );
  assert.equal(updated.ticket.id, created.ticket.id);
  assert.equal(updated.ticket.revision, 2);
  report.completed = true;
  Object.assign(report, {
    healthy,
    evidence,
    recovered,
    classification: brief.classification,
    incidentId: created.ticket.id,
    interpretation:
      'External observations locate failure in item creation, but cannot establish the private storage root cause. The collector correctly abstained.',
  });
  console.log(
    JSON.stringify({
      completed: true,
      incidentId: created.ticket.id,
      diagnosis: 'unknown storage root cause',
      independentReadBack: true,
      recoverySaved: true,
    }),
  );
} finally {
  await stop();
  writeFileSync(
    new URL('./inventory-results.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
