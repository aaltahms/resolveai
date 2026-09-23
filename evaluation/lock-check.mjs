import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { incidentBrief } from '../local-lab/brief.mjs';
const origin = 'http://127.0.0.1:4318';
async function control(action) {
  const r = await fetch(origin + '/' + action, {
    method: 'POST',
    headers: { Origin: origin },
  });
  assert.equal(r.status, 204);
}
async function waitFor(f) {
  for (let i = 0; i < 40; i++) {
    const s = await (await fetch(origin + '/state')).json();
    if (f(s)) return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('Timed out');
}
try {
  await control('restore');
  await waitFor((s) => s.samples[0]?.ok && !s.state.down);
  const before = await (await fetch(origin + '/state')).json();
  await control('lock');
  const failed = await waitFor(
    (s) =>
      s.state.down &&
      s.incidentId &&
      s.incidentId !== before.incidentId &&
      s.samples.slice(0, 3).every((x) => /locked/.test(x.detail)),
  );
  const samples = failed.samples.slice(0, 3);
  const brief = incidentBrief(samples);
  assert.equal(brief.classification, 'database_locked');
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
  assert.equal(
    data.tickets.find((t) => t.id === failed.incidentId)?.title,
    brief.title,
  );
  assert.ok(
    samples.every((s) =>
      s.trace.some((t) => t.status === 'failed' && t.queryOnly === false),
    ),
  );
  writeFileSync(
    new URL('../local-lab/data/latest-lock-check.json', import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        classification: brief.classification,
        samples,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      classification: brief.classification,
      evidence: samples[0].trace,
    }),
  );
} finally {
  await control('restore');
  await waitFor((s) => !s.state.down && s.samples[0]?.ok);
}
