// Pure state machine: only observations from real HTTP probes enter this monitor.
export function observe(state, sample, threshold = 3) {
  const next = {
    ...state,
    failures: sample.ok ? 0 : state.failures + 1,
    successes: sample.ok ? state.successes + 1 : 0,
  };
  let event = null;
  if (!sample.ok && next.failures >= threshold && !state.down) {
    next.down = true;
    event = 'outage';
  }
  if (sample.ok && next.successes >= threshold && state.down) {
    next.down = false;
    event = 'recovery';
  }
  return { state: next, event };
}
