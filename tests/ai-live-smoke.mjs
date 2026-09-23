// Explicit paid integration check. Local server only; not included in pnpm test.
import assert from 'node:assert/strict';
const base = 'http://localhost:3000';
const login = await fetch(base + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const cookie = login.headers.get('set-cookie').split(';')[0];
const call = (path, body) =>
  fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
let r = await call('/api/ai');
const status = await r.json();
assert.equal(status.configured, true);
r = await call('/api/tickets', {
  title: 'AI integration: sensor hostname lookup failure',
  description: 'Synthetic validation case, not an actual device.',
  source: 'example',
  category: 'network',
  asset: 'sensor-client',
  evidence:
    '2026-09-08T12:00:00Z ERROR getaddrinfo ENOTFOUND sensor.internal\n2026-09-08T12:00:01Z WARN No sensor readings received',
});
assert.equal(r.status, 201);
const { ticket } = await r.json();
r = await call('/api/tickets/' + ticket.id + '/ai', {
  revision: ticket.revision,
});
const answer = await r.json();
assert.equal(r.status, 200, JSON.stringify(answer));
assert.ok(answer.ticket.incident.ai.hypotheses.length);
assert.equal(answer.ticket.revision, 2);
const saved = await (await call('/api/tickets')).json();
assert.ok(saved.tickets.find((t) => t.id === ticket.id).incident.ai);
console.log(
  JSON.stringify({
    passed: true,
    model: answer.ticket.incident.ai.model,
    hypotheses: answer.ticket.incident.ai.hypotheses.length,
    persisted: true,
    summary: answer.ticket.incident.ai.summary,
  }),
);
