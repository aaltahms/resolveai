import { observe } from './monitor.mjs';
import { inventoryBrief } from './inventory-probe.mjs';
// One caller owns tick(); concurrent ticks are ignored, not queued.
export function inventoryMonitor({ probe, createIncident, recoverIncident }) {
  let state = { failures: 0, successes: 0, down: false },
    samples = [],
    incident = null,
    busy = false;
  let delivery = null,
    error = null;
  return {
    snapshot: () => ({
      state: { ...state },
      incidentId: incident?.id,
      delivery,
      error,
    }),
    async tick() {
      if (busy) return;
      busy = true;
      try {
        const sample = await probe();
        samples.unshift(sample);
        samples = samples.slice(0, 3);
        const observed = observe(state, sample);
        state = observed.state;
        if (observed.event === 'outage') {
          incident = null;
          delivery = 'creating';
          const brief = inventoryBrief(samples);
          try {
            incident = await createIncident({
              ...brief,
              evidence: samples
                .map((s) => `${s.at} request=${s.requestId} ${s.detail}`)
                .join('\n'),
            });
            delivery = 'saved';
            error = null;
          } catch (e) {
            delivery = 'uncertain';
            error = 'Incident creation was not confirmed: ' + e.message;
          }
        }
        if (observed.event === 'recovery') {
          if (incident) {
            try {
              await recoverIncident(
                incident,
                samples.map((s) => s.detail).join('\n'),
              );
              delivery = 'recovered';
              error = null;
            } catch (e) {
              delivery = 'uncertain';
              error = 'Recovery note was not confirmed: ' + e.message;
            }
          } else {
            error =
              'Service recovered, but no incident was confirmed. Review the collector output.';
          }
        }
        return { ...this.snapshot(), sample };
      } finally {
        busy = false;
      }
    },
  };
}
