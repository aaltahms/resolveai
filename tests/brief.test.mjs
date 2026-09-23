import test from 'node:test';
import assert from 'node:assert/strict';
import { incidentBrief } from '../local-lab/brief.mjs';
const observations = (detail, events) =>
  [0, 1, 2].map((i) => ({
    ok: false,
    requestId: 'req-' + i,
    detail,
    trace: events.map((e) => ({ ...e, requestId: 'req-' + i })),
  }));
test('brief confirms read-only connection without inventing filesystem cause', () => {
  const b = incidentBrief(
    observations('HTTP 503', [
      { stage: 'database', status: 'failed', queryOnly: true },
    ]),
  );
  assert.equal(b.classification, 'database_read_only');
  assert.match(b.description, /Filesystem permissions have not been diagnosed/);
  assert.ok(b.description.length < 1500);
});
test('brief localizes an observed application wait without claiming root cause', () => {
  const b = incidentBrief(
    observations('health HTTP 200; write/read-back TimeoutError', [
      { stage: 'application', status: 'started' },
    ]),
  );
  assert.equal(b.classification, 'application_wait');
  assert.match(b.description, /specific slow operation is unknown/);
});
test('brief handles refused connections', () => {
  assert.equal(
    incidentBrief(observations('health ECONNREFUSED', [])).classification,
    'unreachable',
  );
});
test('brief abstains with missing, mixed, successful, or unrelated traces', () => {
  const samples = observations('TimeoutError', [
    { stage: 'application', status: 'started' },
  ]);
  assert.equal(incidentBrief(samples.slice(0, 2)).classification, 'unknown');
  const mismatch = structuredClone(samples);
  mismatch[0].trace[0].requestId = 'other';
  assert.equal(incidentBrief(mismatch).classification, 'unknown');
  const success = structuredClone(samples);
  success[0].ok = true;
  assert.equal(incidentBrief(success).classification, 'unknown');
  const databaseStarted = structuredClone(samples);
  databaseStarted[0].trace.push({
    requestId: 'req-0',
    stage: 'database_write',
    status: 'started',
  });
  assert.equal(incidentBrief(databaseStarted).classification, 'unknown');
  assert.equal(
    incidentBrief(observations('readonly slow restore', [])).classification,
    'unknown',
  );
});
