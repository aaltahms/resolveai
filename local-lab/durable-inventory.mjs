import { DatabaseSync } from 'node:sqlite';
import { observe } from './monitor.mjs';
import { inventoryBrief } from './inventory-probe.mjs';
export function durableInventory({ path, probe, deliver }) {
  const db = new DatabaseSync(path);
  db.exec(
    'CREATE TABLE IF NOT EXISTS collector_state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)',
  );
  const stored = db
    .prepare('SELECT payload FROM collector_state WHERE id=1')
    .get();
  let data = stored
    ? JSON.parse(stored.payload)
    : {
        state: { failures: 0, successes: 0, down: false },
        samples: [],
        episode: null,
        queue: [],
        incidentId: null,
      };
  const save = () =>
    db
      .prepare(
        'INSERT INTO collector_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      )
      .run(JSON.stringify(data));
  let busy = false,
    error = null;
  return {
    close: () => db.close(),
    snapshot: () => ({
      state: data.state,
      incidentId: data.incidentId,
      pending: data.queue.length,
      error,
    }),
    async tick() {
      if (busy) return;
      busy = true;
      try {
        // A full queue may still drain; only collection pauses while it remains full.
        if (data.queue.length >= 100) {
          while (data.queue.length) {
            try {
              await deliver(data.queue[0]);
            } catch (e) {
              error = 'Delivery pending: ' + e.message;
              return { ...this.snapshot(), sample: null };
            }
            data.queue.shift();
            save();
          }
        }
        const sample = await probe();
        const next = structuredClone(data);
        next.samples.unshift(sample);
        next.samples = next.samples.slice(0, 3);
        const observed = observe(next.state, sample);
        next.state = observed.state;
        if (observed.event === 'outage') {
          next.episode = crypto.randomUUID();
          next.incidentId = 'INV-' + next.episode;
          next.queue.push({
            episode: next.episode,
            phase: 'outage',
            ...inventoryBrief(next.samples),
            evidence: next.samples
              .map((s) => `${s.at} request=${s.requestId} ${s.detail}`)
              .join('\n'),
          });
        }
        if (observed.event === 'recovery' && next.episode)
          next.queue.push({
            episode: next.episode,
            phase: 'recovery',
            evidence: next.samples
              .map((s) => `${s.at} request=${s.requestId} ${s.detail}`)
              .join('\n'),
          });
        data = next;
        save(); // Persist the event and lifecycle before any network side effect.
        error = null;
        while (data.queue.length) {
          try {
            await deliver(data.queue[0]);
          } catch (e) {
            error = 'Delivery pending: ' + e.message;
            break;
          }
          data.queue.shift();
          save();
        }
        return { ...this.snapshot(), sample };
      } finally {
        busy = false;
      }
    },
  };
}
