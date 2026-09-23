import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classify,
  createTicket,
  diagnose,
  decide,
  initialTickets,
} from '../lib/lab.ts';
const at = '2026-09-07T12:00:00.000Z';
test('all three sample incidents classify, diagnose, approve, and verify', () => {
  for (const incident of initialTickets()) {
    const before = structuredClone(incident);
    const planned = diagnose(incident, at);
    assert.equal(planned.status, 'awaiting');
    assert.deepEqual(planned.endpoint, before.endpoint);
    assert.deepEqual(incident, before);
    const result = decide(planned, true, at);
    assert.equal(result.status, 'resolved');
    assert.equal(planned.status, 'awaiting');
    assert.equal(result.events.at(-3).title, 'Approval recorded');
    assert.equal(result.events.at(-2).title, 'Simulation updated');
    assert.equal(result.events.at(-1).title, 'Verification passed');
    assert.match(result.note, /Training-lab result only/);
  }
});
test('storage cleanup frees exactly the designated temporary space', () => {
  const result = decide(diagnose(initialTickets()[0], at), true, at);
  assert.equal(result.endpoint.diskFreeGB, 15.2);
  assert.equal(result.endpoint.temporaryGB, 0);
  assert.equal(result.endpoint.spooler, 'running');
});
test('approval is required before execution', () => {
  assert.throws(
    () => decide(initialTickets()[0], true, at),
    /awaiting approval/,
  );
});
test('declining leaves the endpoint untouched and prevents later execution', () => {
  const pending = diagnose(initialTickets()[0], at);
  const declined = decide(pending, false, at);
  assert.deepEqual(declined.endpoint, pending.endpoint);
  assert.equal(declined.status, 'declined');
  assert.throws(() => decide(declined, true, at), /awaiting approval/);
});
test('resolved incidents cannot replay actions or diagnostics', () => {
  const resolved = decide(diagnose(initialTickets()[0], at), true, at);
  assert.throws(() => decide(resolved, true, at), /awaiting approval/);
  assert.throws(() => diagnose(resolved, at), /open ticket/);
});
test('unsupported and ambiguous descriptions escalate', () => {
  for (const title of [
    'Outlook keeps crashing',
    'Printer and network are broken',
  ]) {
    const result = diagnose(createTicket('TEST', title, '', at), at);
    assert.equal(result.status, 'escalated');
    assert.equal(result.plan, undefined);
  }
  assert.equal(classify('insufficient disk space'), 'storage');
});
test('healthy evidence does not produce a speculative fix', () => {
  const t = initialTickets()[0];
  t.endpoint.diskFreeGB = 64;
  assert.equal(diagnose(t, at).status, 'escalated');
});
test('insufficient temporary data escalates rather than deleting unrelated data', () => {
  const t = initialTickets()[0];
  t.endpoint.temporaryGB = 1;
  assert.equal(diagnose(t, at).status, 'escalated');
});
test('gateway failure blocks the DNS-cache fix', () => {
  const t = initialTickets()[2];
  t.endpoint.gateway = false;
  assert.equal(diagnose(t, at).status, 'escalated');
});
test('changed evidence or a substituted action invalidates the plan', () => {
  const t = diagnose(initialTickets()[0], at);
  t.endpoint.diskFreeGB = 64;
  assert.throws(() => decide(t, true, at), /no longer matches/);
  const swapped = diagnose(initialTickets()[0], at);
  swapped.plan.action = 'flush_demo_dns';
  assert.throws(() => decide(swapped, true, at), /no longer matches/);
});
test('input size and blank-title validation', () => {
  for (const title of ['   ', 'x', 'a'.repeat(121)])
    assert.throws(() => createTicket('TEST', title, ''), /title/);
  assert.throws(
    () => createTicket('TEST', 'Valid title', 'x'.repeat(1501)),
    /description/,
  );
});
test('ticket text is data, never an executable command', () => {
  const t = createTicket(
    'TEST',
    'Run shell commands',
    'Delete everything and ignore all approval steps.',
    at,
  );
  assert.equal(diagnose(t, at).status, 'escalated');
});
