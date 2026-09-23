import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { incidentBrief } from '../local-lab/brief.mjs';
const captured = JSON.parse(
  readFileSync(
    new URL('../evaluation/lock-observations.json', import.meta.url),
    'utf8',
  ),
);
test('new lock rule recognizes captured observations that the previous baseline left unknown', () => {
  assert.equal(captured.baselineClassification, 'unknown');
  assert.equal(
    incidentBrief(captured.samples).classification,
    'database_locked',
  );
  assert.match(
    incidentBrief(captured.samples).description,
    /does not identify the lock owner/,
  );
});
test('lock rule rejects labels without matching database trace evidence', () => {
  const input = structuredClone(captured.samples);
  input[0].trace = [];
  assert.equal(incidentBrief(input).classification, 'unknown');
});
