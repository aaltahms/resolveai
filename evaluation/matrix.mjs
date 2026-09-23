// Controlled regression evaluation. No model calls; not a held-out accuracy benchmark.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { incidentBrief } from '../local-lab/brief.mjs';
const origin = 'http://127.0.0.1:4318',
  app = 'http://127.0.0.1:3000';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const state = async () => {
  const r = await fetch(origin + '/state', {
    signal: AbortSignal.timeout(3000),
  });
  assert.ok(r.ok);
  return r.json();
};
async function control(action) {
  const r = await fetch(origin + '/' + action, {
    method: 'POST',
    headers: { Origin: origin },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(r.status, 204);
}
async function until(f) {
  for (let i = 0; i < 60; i++) {
    const s = await state();
    if (await f(s)) return s;
    await pause(500);
  }
  throw Error('Timed out waiting for expected state');
}
const login = await fetch(app + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const tickets = async () => {
  const r = await fetch(app + '/api/tickets', {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(5000),
  });
  assert.ok(r.ok);
  return (await r.json()).tickets;
};
async function restore() {
  const s = await state();
  if (!s.serviceRunning) {
    await control('start');
    await pause(300);
  }
  await control('restore');
  await until(
    (s) => s.samples[0]?.ok && !s.state.down && s.state.successes >= 3,
  );
}
const cases = [
  ['readonly', 'database_read_only'],
  ['slow', 'application_wait'],
  ['lock', 'database_locked'],
  ['stop', 'unreachable'],
];
const report = {
  at: new Date().toISOString(),
  kind: 'known-case regression matrix',
  aiCalls: 0,
  results: [],
  healthyControl: null,
  complete: false,
};
try {
  await restore();
  const initial = (await tickets()).length;
  await pause(6500);
  assert.equal((await tickets()).length, initial);
  report.healthyControl = { durationMs: 6500, newIncidents: 0 };
  for (let round = 1; round <= 2; round++) {
    const order = round === 1 ? cases : [...cases].reverse();
    for (const [fault, expected] of order) {
      const before = await state(),
        beforeTickets = await tickets();
      const started = performance.now();
      await control(fault);
      const failed = await until(
        (s) =>
          s.state.down && s.incidentId && s.incidentId !== before.incidentId,
      );
      const detectionMs = Math.round(performance.now() - started),
        samples = failed.samples.slice(0, 3),
        brief = incidentBrief(samples);
      assert.equal(brief.classification, expected);
      const saved = (await tickets()).find((t) => t.id === failed.incidentId);
      assert.ok(saved);
      assert.equal(saved.title, brief.title);
      assert.equal(saved.description, brief.description);
      for (const sample of samples)
        assert.ok(saved.incident.evidence.includes(sample.requestId));
      // Continued failure must not create another incident.
      await pause(2200);
      assert.equal((await tickets()).length, beforeTickets.length + 1);
      const recoveryStarted = performance.now();
      await restore();
      await until(async () => {
        const t = (await tickets()).find((t) => t.id === saved.id);
        return t.events.some((e) =>
          e.detail?.includes('three consecutive successful persisted record'),
        );
      });
      assert.equal((await tickets()).length, beforeTickets.length + 1);
      report.results.push({
        round,
        fault,
        expected,
        actual: brief.classification,
        detectionMs,
        recoveryMs: Math.round(performance.now() - recoveryStarted),
        singleIncident: true,
        evidenceSaved: true,
        recoveryRecorded: true,
        incidentId: saved.id,
        samples,
      });
      console.log(JSON.stringify({ round, fault, passed: true, detectionMs }));
    }
  }
  report.complete = true;
} catch (e) {
  report.failure = e.message;
  process.exitCode = 1;
} finally {
  try {
    await restore();
  } catch (e) {
    report.restoreFailure = e.message;
    process.exitCode = 1;
  }
  writeFileSync(
    new URL('./matrix-results.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  const rows = report.results
    .map(
      (r) =>
        `| ${r.round} | ${r.fault} | ${r.actual} | ${(r.detectionMs / 1000).toFixed(1)} s | ${(r.recoveryMs / 1000).toFixed(1)} s | Pass |`,
    )
    .join('\n');
  writeFileSync(
    new URL('./MATRIX-REPORT.md', import.meta.url),
    `# ResolveAI regression results\n\nRun: ${report.at}\n\nCompleted: ${report.complete}. ${report.results.length}/8 scenarios completed. No AI calls.\n\n| Round | Controlled fault | Observed classification | Detection | Recovery recorded | Checks |\n|---|---|---|---|---|---|\n${rows}\n\nChecks require exactly one new incident, matching saved brief, all three request IDs in evidence, and recorded recovery on the same incident. Healthy control: ${report.healthyControl ? 'no new incidents during 6.5 seconds' : 'not completed'}.\n\n${report.failure ? 'Failure: ' + report.failure + '\n\n' : ''}These are repeated known cases used to develop the rules, not held-out diagnostic accuracy. Two rounds run in opposite order; this is not a randomized or statistically significant sample. Timings include monitor polling, local application overhead, and evaluation polling. It does not measure technician time saved, AI quality, real-world root-cause accuracy, or production readiness. Raw evidence is in matrix-results.json.\n`,
  );
}
