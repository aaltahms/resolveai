import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newIncident,
  analyzeEvidence,
  workIncident,
  guides,
  incidentReport,
} from '../lib/incidents.ts';
import { diagnose, decide } from '../lib/lab.ts';
const record = (evidence = '') =>
  newIncident(
    'INC-test',
    'Application failure',
    'Customer request fails',
    { source: 'reported', priority: 'P2', asset: 'api-01', evidence },
    'unknown',
  );
test('reported incidents cannot enter simulation diagnosis or approval', () => {
  const t = record('Error ECONNREFUSED 127.0.0.1:8080');
  assert.throws(() => diagnose(t), /evidence analysis/);
  assert.throws(
    () => decide({ ...t, status: 'awaiting' }, true),
    /technician verification/,
  );
});
test('every guide recognizes its own evidence, with exact source line attribution', () => {
  for (const g of guides) {
    const a = analyzeEvidence(`Healthy startup\n${g.example}\nReady`);
    assert.ok(a.matches.some((m) => m.id === g.id));
    const m = a.matches.find((m) => m.id === g.id);
    assert.deepEqual(m.lines, [2]);
    assert.equal(m.excerpts[0], g.example);
  }
});
test('unknown evidence is not invented and multiple errors remain separate leads', () => {
  assert.equal(analyzeEvidence('Everything feels slow').matches.length, 0);
  const a = analyzeEvidence(
    'ENOENT config.json\nECONNREFUSED 127.0.0.1:8080\nECONNREFUSED 127.0.0.1:8080',
  );
  assert.equal(a.matches.length, 2);
  assert.deepEqual(a.matches.find((m) => m.id === 'refused').lines, [2, 3]);
});
test('analysis preserves source and endpoint, and does not mark an incident resolved', () => {
  const t = record('getaddrinfo ENOTFOUND service.internal');
  const a = workIncident(t, 'analyze', {});
  assert.equal(a.status, 'investigating');
  assert.equal(a.category, 'network');
  assert.equal(a.incident.source, 'reported');
  assert.deepEqual(a.endpoint, t.endpoint);
  assert.equal(a.plan, undefined);
  assert.equal(t.incident.analysis, undefined);
});
test('replacing evidence invalidates previous analysis', () => {
  const t = workIncident(record('ENOENT path'), 'analyze', {});
  const next = workIncident(t, 'evidence', { text: 'Different failure' });
  assert.equal(next.incident.analysis, undefined);
  assert.equal(next.incident.evidence, 'Different failure');
});
test('verification notes are required, closed incidents are immutable until a documented reopening', () => {
  const t = record('ENOENT path');
  assert.throws(
    () => workIncident(t, 'resolve', { text: 'fixed' }),
    /20 characters/,
  );
  const closed = workIncident(t, 'resolve', {
    text: 'Restored the missing configuration. Repeated the original request successfully.',
  });
  assert.equal(closed.status, 'resolved');
  assert.match(closed.note, /Repeated/);
  for (const op of [
    'comment',
    'analyze',
    'details',
    'evidence',
    'resolve',
    'escalate',
  ])
    assert.throws(
      () => workIncident(closed, op, { text: 'New note' }),
      /Reopen/,
    );
  assert.throws(
    () => workIncident(closed, 'reopen', { text: 'no' }),
    /10 characters/,
  );
  const reopened = workIncident(closed, 'reopen', {
    text: 'The same failure returned after deployment.',
  });
  assert.equal(reopened.status, 'investigating');
  assert.equal(reopened.note, closed.note);
});
test('reports include real notes, evidence, matched guidance, and provenance', () => {
  let t = workIncident(record('EACCES: permission denied'), 'analyze', {});
  t = workIncident(t, 'comment', {
    text: 'Checked the service account permissions.',
  });
  const report = incidentReport(t);
  assert.match(report, /Source: reported/);
  assert.match(report, /EACCES/);
  assert.match(report, /Checked the service account/);
  assert.match(report, /https:\/\/nodejs.org/);
});
