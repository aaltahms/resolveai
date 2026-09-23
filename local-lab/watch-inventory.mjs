import { acquireProcessLock } from './process-lock.mjs';
import { probeInventory } from './inventory-probe.mjs';
import { durableInventory } from './durable-inventory.mjs';
import { mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const app = 'http://127.0.0.1:3000';
const directory = new URL('./data/', import.meta.url);
mkdirSync(directory, { recursive: true });
const releaseLock = acquireProcessLock(
  fileURLToPath(new URL('inventory-owner.sqlite', directory)),
);
let cookie,
  stopping = false;
async function api(path, body, method = 'POST') {
  if (!cookie) {
    const login = await fetch(app + '/signin-with-chatgpt?return_to=/', {
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    });
    cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw Error('Local incident desk sign-in unavailable');
  }
  const r = await fetch(app + path, {
    method: body ? method : 'GET',
    headers: {
      Cookie: cookie,
      Origin: app,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401) cookie = null;
    throw Error(d.error || 'Incident request failed');
  }
  return d;
}
const monitor = durableInventory({
  path: fileURLToPath(new URL('inventory-state.sqlite', directory)),
  probe: probeInventory,
  deliver: async (event) => api('/api/collector', event),
});
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
let last = '';
try {
  console.log('Watching inventory at 127.0.0.1:4321. Press Control-C to stop.');
  while (!stopping) {
    const result = await monitor.tick();
    // Rotate at 5 MB, retaining one previous log; no request bodies or credentials.
    const logPath = new URL('inventory-monitor.jsonl', directory);
    try {
      if (statSync(logPath).size >= 5 * 1024 * 1024)
        renameSync(
          logPath,
          new URL('inventory-monitor.previous.jsonl', directory),
        );
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    appendFileSync(
      new URL('inventory-monitor.jsonl', directory),
      JSON.stringify({ at: new Date().toISOString(), ...result }) + '\n',
      { mode: 0o600 },
    );
    const text =
      result.error ||
      (result.state.down
        ? 'Saving failed' +
          (result.incidentId ? ' — incident ' + result.incidentId : '')
        : 'Inventory saving is working');
    if (text !== last) {
      console.log(text);
      last = text;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
} finally {
  monitor.close();
  releaseLock();
}
