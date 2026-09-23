import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3000';
const login = await fetch(base + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const cookie = login.headers.get('set-cookie').split(';')[0];
const event = {
  episode: crypto.randomUUID(),
  phase: 'outage',
  title: 'Collector delivery retry check',
  description: 'Synthetic local API validation',
  evidence: 'Three failed inventory writes',
};
const send = (body, headers = {}) =>
  fetch(base + '/api/collector', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
assert.equal((await send(event, { Cookie: '' })).status, 401);
assert.equal(
  (await send(event, { Origin: 'https://other.example' })).status,
  403,
);
const first = await send(event);
assert.equal(first.status, 200);
const a = (await first.json()).ticket;
const again = await send(event);
assert.equal(again.status, 200);
assert.equal((await again.json()).ticket.id, a.id);
assert.equal((await send({ ...event, evidence: 'different' })).status, 409);
const recovery = {
  episode: event.episode,
  phase: 'recovery',
  evidence: 'Three independent create/read-back checks succeeded',
};
for (let i = 0; i < 2; i++) {
  const r = await send(recovery);
  assert.equal(r.status, 200);
  const t = (await r.json()).ticket;
  assert.equal(t.revision, 2);
  assert.equal(
    t.events.filter((e) => e.title === 'Inventory recovery verified').length,
    1,
  );
}
console.log(
  'Passed: authenticated collector API, origin checks, idempotent outage/recovery, conflicting replay rejection.',
);
