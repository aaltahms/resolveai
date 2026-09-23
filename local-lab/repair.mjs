import { DatabaseSync } from 'node:sqlite';
import { incidentBrief } from './brief.mjs';

export class RepairError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}
const fingerprint = (s) =>
  JSON.stringify([
    s.revision,
    s.running,
    s.pid,
    s.queryOnly,
    s.locked,
    s.delay,
  ]);
const actions = {
  database_read_only: {
    action: 'enable-writes',
    title: 'Re-enable writes on the owned database connection',
    impact:
      'Changes SQLite query_only to OFF on this service connection only. Existing records are retained.',
  },
  database_locked: {
    action: 'release-owned-lock',
    title: 'Release the lab-owned blocking transaction',
    impact:
      'Rolls back the empty test transaction held by this service. Does not terminate other processes or touch database files.',
  },
  unreachable: {
    action: 'start-service',
    title: 'Start the owned request-saving service',
    impact:
      'Starts this project’s service process on port 4319. Existing records are retained.',
  },
};
export function repairCandidate(samples, snapshot, now = Date.now()) {
  const recent = samples.slice(0, 3);
  if (
    recent.length !== 3 ||
    new Set(recent.map((s) => s.requestId)).size !== 3 ||
    recent.some(
      (s) =>
        s.ok ||
        s.revision !== snapshot.revision ||
        !Number.isFinite(Date.parse(s.at)) ||
        now - Date.parse(s.at) > 12000 ||
        Date.parse(s.at) > now,
    )
  )
    throw new RepairError(
      'Collect three fresh failed checks after the last service change before planning a repair.',
    );
  const diagnosis = incidentBrief(recent);
  const supported =
    diagnosis.classification === 'database_read_only'
      ? snapshot.running &&
        snapshot.queryOnly &&
        !snapshot.locked &&
        !snapshot.delay
      : diagnosis.classification === 'database_locked'
        ? snapshot.running &&
          snapshot.locked &&
          !snapshot.queryOnly &&
          !snapshot.delay
        : diagnosis.classification === 'unreachable'
          ? !snapshot.running
          : false;
  if (!supported)
    throw new RepairError(
      'No supported repair is justified by these observations. Collect more evidence or use the manual troubleshooting guides.',
    );
  return {
    ...actions[diagnosis.classification],
    diagnosis,
    evidence: recent.map((s) => ({
      requestId: s.requestId,
      at: s.at,
      detail: s.detail,
    })),
    fingerprint: fingerprint(snapshot),
  };
}

export function repairController({
  path,
  inspect,
  samples,
  execute,
  verify,
  now = Date.now,
}) {
  const db = new DatabaseSync(path);
  db.exec(
    'CREATE TABLE IF NOT EXISTS repairs (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL)',
  );
  const write = (p) =>
    db
      .prepare(
        'INSERT INTO repairs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      )
      .run(p.id, JSON.stringify(p), p.createdAt);
  for (const row of db.prepare('SELECT payload FROM repairs').all()) {
    const p = JSON.parse(row.payload);
    if (p.status === 'applying')
      write({
        ...p,
        status: 'interrupted',
        message:
          'The controller restarted during repair. Inspect the service before planning another repair; the action will not be repeated automatically.',
      });
    if (p.status === 'planned')
      write({
        ...p,
        status: 'expired',
        message:
          'The controller restarted. Collect fresh evidence and plan again.',
      });
  }
  let busy = false;
  const get = (id) => {
    const r = db.prepare('SELECT payload FROM repairs WHERE id=?').get(id);
    if (!r) throw new RepairError('Repair plan not found.', 404);
    return JSON.parse(r.payload);
  };
  return {
    get busy() {
      return busy;
    },
    async plan() {
      if (busy) throw new RepairError('A repair is already running.');
      const candidate = repairCandidate(samples(), await inspect(), now());
      const p = {
        ...candidate,
        id: crypto.randomUUID(),
        createdAt: now(),
        expiresAt: now() + 60000,
        status: 'planned',
        scope: 'Owned local request-saving service only',
        verification: [],
      };
      write(p);
      db.exec(
        'DELETE FROM repairs WHERE id IN (SELECT id FROM repairs ORDER BY created_at DESC LIMIT -1 OFFSET 200)',
      );
      return p;
    },
    async approve(id) {
      const p = get(id);
      if (p.status !== 'planned') return p;
      if (busy) throw new RepairError('A repair is already running.');
      busy = true;
      try {
        if (
          now() > p.expiresAt ||
          fingerprint(await inspect()) !== p.fingerprint
        ) {
          p.status = 'expired';
          p.message =
            'The plan expired or service conditions changed. Diagnose again.';
          write(p);
          throw new RepairError(p.message);
        }
        // Re-evaluate evidence immediately before the single allowed action.
        const candidate = repairCandidate(samples(), await inspect(), now());
        if (
          candidate.action !== p.action ||
          candidate.fingerprint !== p.fingerprint
        )
          throw new RepairError('The diagnosis changed. Plan again.');
        p.status = 'applying';
        p.approvedAt = now();
        write(p);
        try {
          await execute(p.action);
          for (let i = 0; i < 3; i++) p.verification.push(await verify());
          p.status = p.verification.every((v) => v.ok) ? 'verified' : 'failed';
          p.message =
            p.status === 'verified'
              ? 'Three new records were written and independently read back. Retry your original request.'
              : 'The action ran, but functional verification failed. No further repair will run automatically.';
        } catch (e) {
          p.status = 'failed';
          p.message = 'Repair could not be verified: ' + e.message;
        }
        p.completedAt = now();
        write(p);
        return p;
      } finally {
        busy = false;
      }
    },
    history() {
      return db
        .prepare(
          'SELECT payload FROM repairs ORDER BY created_at DESC LIMIT 10',
        )
        .all()
        .map((r) => JSON.parse(r.payload));
    },
    close() {
      db.close();
    },
  };
}

export async function verifyOwnedService(fetcher = fetch) {
  const id = crypto.randomUUID(),
    value = 'ResolveAI repair verification',
    began = Date.now();
  try {
    const response = await fetcher('http://127.0.0.1:4319/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, value }),
      signal: AbortSignal.timeout(1200),
    });
    const written = await response.json();
    const read = await fetcher('http://127.0.0.1:4319/records', {
      signal: AbortSignal.timeout(1200),
    });
    const data = await read.json();
    const ok =
      response.status === 201 &&
      written.record?.id === id &&
      read.ok &&
      data.recent?.some((r) => r.id === id && r.value === value);
    return {
      id,
      at: new Date().toISOString(),
      ok: !!ok,
      elapsedMs: Date.now() - began,
      detail: `Write HTTP ${response.status}; independent read HTTP ${read.status}; matching stored record ${ok ? 'confirmed' : 'not confirmed'}`,
    };
  } catch (e) {
    return {
      id,
      at: new Date().toISOString(),
      ok: false,
      elapsedMs: Date.now() - began,
      detail: e.cause?.code || e.name,
    };
  }
}
