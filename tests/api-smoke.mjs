// Explicit local integration check. Run only against the local development lab.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3000';
const response = await fetch(base);
assert.equal(response.status, 200);
const unauth = await fetch(`${base}/api/tickets`);
assert.equal(unauth.status, 401);
const login = await fetch(`${base}/signin-with-chatgpt?return_to=/`, {
  redirect: 'manual',
});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
async function call(path, body, method = 'POST', origin = base) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : method,
    headers: {
      Cookie: cookie,
      Connection: 'close',
      ...(body === undefined
        ? {}
        : { Origin: origin, 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const originalJson = response.json.bind(response);
  response.json = async () => {
    try {
      return await originalJson();
    } catch {
      throw Error(
        `Expected JSON from ${method} ${path}; received HTTP ${response.status}.`,
      );
    }
  };
  return response;
}
let r = await call('/api/tickets');
assert.equal(r.status, 200);
r = await call('/api/tickets/seed', {});
assert.equal(r.status, 200);
r = await call('/api/tickets', {
  title: 'Disk space exhausted - persistence check',
  description: 'Synthetic local API test.',
  source: 'simulation',
});
assert.equal(r.status, 201);
const { ticket } = await r.json();
const uri = `/api/tickets/${ticket.id}`;
const diagnosed = await Promise.all([
  call(uri, { operation: 'diagnose', revision: 1 }, 'PATCH'),
  call(uri, { operation: 'diagnose', revision: 1 }, 'PATCH'),
]);
assert.deepEqual(
  diagnosed.map((x) => x.status).sort((a, b) => a - b),
  [200, 409],
);
r = await call(
  uri,
  { operation: 'approve', revision: 2, endpoint: { diskFreeGB: 999 } },
  'PATCH',
);
assert.equal(r.status, 400);
r = await call(
  uri,
  { operation: 'approve', revision: 2 },
  'PATCH',
  'https://untrusted.example',
);
assert.equal(r.status, 403);
r = await call(uri, { operation: 'approve', revision: 2 }, 'PATCH');
assert.equal(r.status, 200);
const { ticket: resolved } = await r.json();
assert.equal(resolved.status, 'resolved');
assert.equal(resolved.endpoint.diskFreeGB, 15.2);
r = await call('/api/tickets');
const { tickets } = await r.json();
const saved = tickets.find((t) => t.id === ticket.id);
assert.equal(saved.revision, 3);
assert.equal(saved.status, 'resolved');
assert.match(saved.note, /15.2/);
console.log(
  JSON.stringify({
    passed: true,
    checks: [
      'route rendering',
      'authentication',
      'sample seeding',
      'ticket creation',
      'conflicting diagnostics',
      'payload validation',
      'cross-origin denial',
      'approval',
      'persistent readback',
    ],
    savedTicketId: ticket.id,
  }),
);

r = await call('/api/tickets', {
  title: 'Real log investigation',
  description: 'Local test record',
  evidence: 'ENOENT config.json',
  priority: 'P2',
  category: 'application',
  asset: 'test-api',
});
assert.equal(r.status, 201);
let actual = (await r.json()).ticket;
assert.equal(actual.incident.source, 'reported');
const workUri = `/api/tickets/${actual.id}/work`;
r = await call(
  `/api/tickets/${actual.id}`,
  { operation: 'diagnose', revision: 1 },
  'PATCH',
);
assert.equal(r.status, 409);
r = await call(
  workUri,
  {
    operation: 'details',
    revision: 1,
    priority: 'P0',
    category: 'unknown',
    asset: '',
  },
  'PATCH',
);
assert.equal(r.status, 400);
r = await call(
  workUri,
  { operation: 'analyze', revision: 1, endpoint: { dns: 'healthy' } },
  'PATCH',
);
assert.equal(r.status, 400);
r = await call(workUri, { operation: 'analyze', revision: 1 }, 'PATCH');
assert.equal(r.status, 200);
actual = (await r.json()).ticket;
assert.equal(actual.incident.analysis.matches[0].id, 'missing');
assert.equal(actual.status, 'investigating');
r = await call(
  workUri,
  { operation: 'resolve', revision: 2, text: 'fixed' },
  'PATCH',
);
assert.equal(r.status, 409);
r = await call(
  workUri,
  { operation: 'comment', revision: 2, text: 'A note' },
  'PATCH',
  'https://untrusted.example',
);
assert.equal(r.status, 403);
r = await call(
  workUri,
  {
    operation: 'resolve',
    revision: 2,
    text: 'Restored configuration; original request now succeeds.',
  },
  'PATCH',
);
assert.equal(r.status, 200);
r = await call(
  workUri,
  { operation: 'evidence', revision: 3, text: 'new evidence' },
  'PATCH',
);
assert.equal(r.status, 409);
r = await call(
  workUri,
  {
    operation: 'reopen',
    revision: 3,
    text: 'Problem returned with the next deployment.',
  },
  'PATCH',
);
assert.equal(r.status, 200);
r = await call(
  workUri,
  { operation: 'evidence', revision: 4, text: '测'.repeat(5999) },
  'PATCH',
);
assert.equal(r.status, 200);
r = await call('/api/tickets');
actual = (await r.json()).tickets.find((t) => t.id === actual.id);
assert.equal(actual.revision, 5);
assert.equal(actual.incident.evidence.length, 5999);
assert.equal(actual.incident.analysis, undefined);
console.log(
  'Real incident API checks passed: creation, evidence analysis, validation, cross-origin denial, verified closure, reopening, Unicode persistence.',
);
