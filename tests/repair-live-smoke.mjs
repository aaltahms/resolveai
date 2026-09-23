// Real local child process and SQLite checks. No paid AI calls.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:4318';
const state = async () => {
  const r = await fetch(base + '/state');
  return r.json();
};
const post = (path, body, origin = base) =>
  fetch(base + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
const control = async (action) =>
  assert.equal((await post('/' + action)).status, 204);
async function until(fn) {
  for (let i = 0; i < 60; i++) {
    const s = await state();
    if (fn(s)) return s;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw Error('Condition timed out');
}
async function plan() {
  for (let i = 0; i < 30; i++) {
    const r = await post('/repair/plan');
    const d = await r.json();
    if (r.ok) return d;
    if (!/finishing|three fresh/.test(d.error)) throw Error(d.error);
    await new Promise((r) => setTimeout(r, 400));
  }
  throw Error('Plan timed out');
}
const results = [];
try {
  assert.equal(
    (await post('/repair/plan', {}, 'https://untrusted.example')).status,
    403,
  );
  await control('start');
  await control('restore');
  await until((s) => !s.state.down && s.samples[0]?.ok);
  // Exercise production retention logic: polling must not erase user requests.
  const keptId = crypto.randomUUID();
  const write = async (id, value) => {
    const r = await fetch('http://127.0.0.1:4319/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, value }),
    });
    assert.equal(r.status, 201);
  };
  await write(
    keptId,
    'User request: Development retention check — synthetic test',
  );
  for (let i = 0; i < 1001; i++)
    await write(crypto.randomUUID(), 'Development retention probe');
  const kept = await (await fetch('http://127.0.0.1:4319/records')).json();
  assert.ok(
    kept.submitted.some((r) => r.id === keptId),
    'Monitor retention removed a user request',
  );
  for (const [fault, action] of [
    ['readonly', 'enable-writes'],
    ['lock', 'release-owned-lock'],
    ['stop', 'start-service'],
  ]) {
    await control(fault);
    await until((s) => s.state.down);
    const p = await plan();
    assert.equal(p.action, action);
    let response;
    for (let i = 0; i < 20; i++) {
      response = await post('/repair/approve', { id: p.id });
      if (response.status !== 409) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(response.status, 200);
    const repaired = await response.json();
    assert.equal(repaired.status, 'verified');
    assert.equal(repaired.verification.length, 3);
    assert.ok(repaired.verification.every((v) => v.ok));
    const replay = await post('/repair/approve', { id: p.id });
    assert.equal((await replay.json()).completedAt, repaired.completedAt);
    results.push({
      fault,
      action,
      status: repaired.status,
      verification: repaired.verification,
    });
    await until((s) => !s.state.down && s.samples[0]?.ok);
  }
  await control('readonly');
  await until((s) => s.state.down);
  const stale = await plan();
  await control('restore');
  let response;
  for (let i = 0; i < 20; i++) {
    response = await post('/repair/approve', { id: stale.id });
    const d = await response.clone().json();
    if (!/finishing/.test(d.error || '')) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(response.status, 409);
  await until((s) => !s.state.down);
  writeFileSync(
    new URL('../evaluation/repair-results.json', import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          'Controlled faults in the owned local Node/SQLite service; not general device repair',
        originRejection: true,
        stalePlanRejection: true,
        userRequestRetention: true,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    'Passed: three real service repairs, nine independent write/read checks, replay protection, stale plan and foreign-origin rejection.',
  );
} finally {
  await control('start');
  await control('restore');
}
