import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSummary } from '../lib/troubleshooting.ts';
import { collectorReport } from '../chrome-extension/report.js';

test('old background-only reports explain the missing action', () => {
  const summary = captureSummary(
    'Source: Chrome user-triggered capture; local test page only.\nGET /state — HTTP 200 — 4 ms',
  );
  assert.equal(summary.background, 1);
  assert.equal(summary.actions.length, 0);
  assert.match(summary.message, /not recorded/);
});
test('new captures omit successful polling but preserve failed background requests', () => {
  const report = collectorReport({
    id: crypto.randomUUID(),
    rows: [
      {
        method: 'GET',
        path: '/state',
        status: 200,
        durationMs: 4,
        failed: false,
      },
      {
        method: 'GET',
        path: '/state',
        status: 503,
        durationMs: 4,
        failed: true,
      },
      {
        method: 'POST',
        path: '/submit',
        status: 503,
        durationMs: 4,
        failed: true,
      },
    ],
  });
  const summary = captureSummary(report.evidence);
  assert.equal(summary.background, 1);
  assert.equal(summary.failures.length, 2);
  assert.ok(!report.evidence.includes('HTTP 200'));
});
