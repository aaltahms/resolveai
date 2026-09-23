import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4318';
const call = async (action) => {
  const r = await fetch(base + '/' + action, {
    method: 'POST',
    headers: { Origin: base },
  });
  assert.equal(r.status, 204);
};
async function until(f) {
  for (let i = 0; i < 50; i++) {
    const s = await (await fetch(base + '/state')).json();
    if (f(s)) return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('Trace check timed out');
}
const results = [];
try {
  await call('restore');
  const healthy = await until(
    (s) =>
      s.samples[0]?.ok &&
      s.samples[0].trace?.some(
        (t) => t.stage === 'database_read' && t.status === 'completed',
      ) &&
      !s.state.down,
  );
  assert.ok(
    healthy.samples[0].trace.every(
      (t) => t.requestId === healthy.samples[0].requestId,
    ),
  );
  for (const fault of ['readonly', 'slow']) {
    const before = await (await fetch(base + '/state')).json();
    await call(fault);
    const down = await until(
      (s) => s.state.down && s.incidentId !== before.incidentId && s.incidentId,
    );
    const sample = down.samples[0];
    assert.ok(sample.trace.length);
    assert.ok(sample.trace.every((t) => t.requestId === sample.requestId));
    if (fault === 'readonly')
      assert.ok(
        sample.trace.some((t) => t.status === 'failed' && t.queryOnly === true),
      );
    else {
      assert.ok(
        sample.trace.some(
          (t) => t.stage === 'application' && t.status === 'started',
        ),
      );
      assert.ok(!sample.trace.some((t) => t.stage === 'database_write'));
    }
    const login = await fetch(
      'http://127.0.0.1:3000/signin-with-chatgpt?return_to=/',
      { redirect: 'manual' },
    );
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const data = await (
      await fetch('http://127.0.0.1:3000/api/tickets', {
        headers: { Cookie: cookie },
      })
    ).json();
    const ticket = data.tickets.find((t) => t.id === down.incidentId);
    assert.ok(ticket.incident.evidence.includes(sample.requestId));
    assert.match(ticket.description, /Next check:/);
    assert.match(ticket.description, /Not established:/);
    assert.match(
      ticket.title,
      fault === 'readonly' ? /read-only mode/ : /before a database write/,
    );
    assert.ok(ticket.incident.evidence.includes('application: started'));
    results.push({ fault, trace: sample.trace, incidentEvidenceSaved: true });
    await call('restore');
    await until((s) => !s.state.down && s.samples[0]?.ok);
  }
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await call('restore');
}
