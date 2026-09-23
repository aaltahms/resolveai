import test from 'node:test';
import assert from 'node:assert/strict';
import { observe } from '../local-lab/monitor.mjs';
test('monitor debounces failure and recovery and emits one event per transition', () => {
  let state = { failures: 0, successes: 0, down: false };
  const events = [];
  for (const ok of [
    false,
    true,
    false,
    false,
    false,
    false,
    true,
    false,
    true,
    true,
    true,
    true,
  ]) {
    const r = observe(state, { ok });
    state = r.state;
    if (r.event) events.push(r.event);
  }
  assert.deepEqual(events, ['outage', 'recovery']);
  assert.equal(state.down, false);
});
