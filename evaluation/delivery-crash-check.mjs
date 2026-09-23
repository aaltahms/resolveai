// Real child-process termination + real local HTTP delivery. Probe observations are fixtures.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { durableInventory } from '../local-lab/durable-inventory.mjs';
const base = 'http://127.0.0.1:3000';
async function session() {
  const r = await fetch(base + '/signin-with-chatgpt?return_to=/', {
    redirect: 'manual',
  });
  const cookie = r.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}
if (process.argv[2] === 'child') {
  const [, , , path, mode] = process.argv;
  const cookie = await session();
  const probe = async () => ({
    ok: mode.startsWith('recover'),
    requestId: crypto.randomUUID(),
    at: new Date().toISOString(),
    detail: mode.startsWith('recover')
      ? 'Fixture: create/read succeeded'
      : 'Synthetic crash-test observation: Inventory readiness HTTP 200; create item HTTP 503; error=storage_unavailable',
  });
  const monitor = durableInventory({
    path,
    probe,
    deliver: async (event) => {
      const r = await fetch(base + '/api/collector', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: base,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
      assert.equal(r.status, 200);
      await r.json();
      // SIGKILL prevents queue acknowledgement and normal cleanup after the remote commit.
      if (mode.endsWith('crash')) process.kill(process.pid, 'SIGKILL');
    },
  });
  try {
    for (let i = 0; i < 3; i++) await monitor.tick();
    console.log(JSON.stringify(monitor.snapshot()));
  } finally {
    monitor.close();
  }
} else {
  const directory = mkdtempSync(join(tmpdir(), 'resolveai-crash-')),
    path = join(directory, 'state.sqlite');
  const report = {
    at: new Date().toISOString(),
    completed: false,
    probeSource: 'fixed synthetic observations',
    delivery: 'real local collector HTTP API',
    aiCalls: 0,
  };
  async function run(mode) {
    return new Promise((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [fileURLToPath(import.meta.url), 'child', path, mode],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let out = '',
        err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('error', reject);
      p.on('exit', (code, signal) => resolve({ code, signal, out, err }));
    });
  }
  const cookie = await session();
  const list = async () => {
    const r = await fetch(base + '/api/tickets', {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    return (await r.json()).tickets;
  };
  try {
    const before = await list();
    const createCrash = await run('outage-crash');
    assert.equal(createCrash.signal, 'SIGKILL', createCrash.err);
    assert.equal((await list()).length, before.length + 1);
    const resumed = await run('outage-ack');
    assert.equal(resumed.code, 0, resumed.err);
    const state = JSON.parse(resumed.out);
    assert.equal(state.pending, 0);
    const id = state.incidentId;
    assert.equal((await list()).length, before.length + 1);
    const recoveryCrash = await run('recover-crash');
    assert.equal(recoveryCrash.signal, 'SIGKILL', recoveryCrash.err);
    const recovered = await run('recover-ack');
    assert.equal(recovered.code, 0, recovered.err);
    assert.equal(JSON.parse(recovered.out).pending, 0);
    const tickets = await list(),
      ticket = tickets.find((t) => t.id === id);
    assert.equal(tickets.length, before.length + 1);
    assert.equal(ticket.revision, 2);
    assert.equal(
      ticket.events.filter((e) => e.title === 'Inventory recovery verified')
        .length,
      1,
    );
    Object.assign(report, {
      completed: true,
      forcedCrashes: 2,
      incidentId: id,
      newIncidents: 1,
      recoveryNotes: 1,
      finalRevision: ticket.revision,
      pendingEvents: 0,
    });
    console.log(JSON.stringify(report));
  } finally {
    writeFileSync(
      new URL('./delivery-crash-results.json', import.meta.url),
      JSON.stringify(report, null, 2),
    );
    rmSync(directory, { recursive: true, force: true });
  }
}
