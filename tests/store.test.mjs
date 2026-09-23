import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  listTickets,
  seedTickets,
  addTicket,
  transitionTicket,
} from '../lib/ticket-store.ts';
import { identity, verifyWrite, readBody } from '../lib/api.ts';
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    readFileSync(
      new URL('../drizzle/0000_vengeful_earthquake.sql', import.meta.url),
      'utf8',
    ),
  );
  const db = {
    prepare(query) {
      return {
        bind(...args) {
          const stmt = sql.prepare(query);
          return {
            async all() {
              return { results: stmt.all(...args) };
            },
            async first() {
              return stmt.get(...args) || null;
            },
            async run() {
              return { meta: { changes: Number(stmt.run(...args).changes) } };
            },
          };
        },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sql.exec('COMMIT');
        return result;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, close: () => sql.close() };
}
test('saved tickets survive a fresh read and users cannot see or change each other’s tickets', async () => {
  const { db, close } = database();
  try {
    await seedTickets(db, 'alice');
    assert.equal((await listTickets(db, 'alice')).length, 3);
    assert.equal((await listTickets(db, 'bob')).length, 0);
    await assert.rejects(
      () => transitionTicket(db, 'bob', 'INC-001', 'diagnose', 1),
      (e) => e.status === 404,
    );
    const pending = await transitionTicket(
      db,
      'alice',
      'INC-001',
      'diagnose',
      1,
    );
    assert.equal(pending.revision, 2);
    const resolved = await transitionTicket(
      db,
      'alice',
      'INC-001',
      'approve',
      2,
    );
    assert.equal(resolved.status, 'resolved');
    const readback = (await listTickets(db, 'alice')).find(
      (t) => t.id === 'INC-001',
    );
    assert.equal(readback.endpoint.diskFreeGB, 15.2);
    assert.equal(readback.revision, 3);
    assert.deepEqual(readback.events, resolved.events);
  } finally {
    close();
  }
});
test('loading examples twice does not reset completed work', async () => {
  const { db, close } = database();
  try {
    await seedTickets(db, 'a');
    await transitionTicket(db, 'a', 'INC-001', 'diagnose', 1);
    await seedTickets(db, 'a');
    const records = await listTickets(db, 'a');
    assert.equal(records.length, 3);
    assert.equal(records[0].status, 'awaiting');
  } finally {
    close();
  }
});
test('two concurrent approvals produce exactly one change', async () => {
  const { db, close } = database();
  try {
    await seedTickets(db, 'a');
    await transitionTicket(db, 'a', 'INC-001', 'diagnose', 1);
    const results = await Promise.allSettled([
      transitionTicket(db, 'a', 'INC-001', 'approve', 2),
      transitionTicket(db, 'a', 'INC-001', 'approve', 2),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.status,
      409,
    );
    const row = (await listTickets(db, 'a'))[0];
    assert.equal(row.revision, 3);
    assert.equal(
      row.events.filter((e) => e.title === 'Approval recorded').length,
      1,
    );
  } finally {
    close();
  }
});
test('stale revisions and approval before diagnosis do not mutate saved state', async () => {
  const { db, close } = database();
  try {
    await seedTickets(db, 'a');
    await assert.rejects(
      () => transitionTicket(db, 'a', 'INC-001', 'approve', 1),
      (e) => e.status === 409,
    );
    await assert.rejects(
      () => transitionTicket(db, 'a', 'INC-001', 'diagnose', 8),
      (e) => e.status === 409,
    );
    assert.equal((await listTickets(db, 'a'))[0].revision, 1);
  } finally {
    close();
  }
});
test('new records are stored without interpreting SQL-like title text', async () => {
  const { db, close } = database();
  try {
    const t = await addTicket(
      db,
      'a',
      "Printer '; DROP TABLE tickets; --",
      'Fictional issue',
    );
    assert.equal(t.revision, 1);
    assert.equal((await listTickets(db, 'a'))[0].title, t.title);
  } finally {
    close();
  }
});
test('missing identity and cross-origin writes are rejected', () => {
  assert.throws(
    () => identity(new Request('https://lab.test/api/tickets')),
    (e) => e.status === 401,
  );
  assert.throws(
    () =>
      verifyWrite(
        new Request('https://lab.test/api/tickets', {
          headers: { Origin: 'https://other.test' },
        }),
      ),
    (e) => e.status === 403,
  );
  assert.throws(
    () => verifyWrite(new Request('https://lab.test/api/tickets')),
    (e) => e.status === 403,
  );
  assert.doesNotThrow(() =>
    verifyWrite(
      new Request('https://lab.test/api/tickets', {
        headers: { Origin: 'https://lab.test' },
      }),
    ),
  );
});
test('request reader rejects oversized, non-object, malformed, and non-JSON payloads', async () => {
  for (const [body, status] of [
    ['[1]', 400],
    ['{', 400],
    ['x'.repeat(9000), 413],
  ])
    await assert.rejects(
      () =>
        readBody(
          new Request('https://lab.test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }),
        ),
      (e) => e.status === status,
    );
  await assert.rejects(
    () =>
      readBody(
        new Request('https://lab.test', { method: 'POST', body: 'hello' }),
      ),
    (e) => e.status === 415,
  );
});

test('real incident workflow persists evidence and verification with revision conflicts enforced', async () => {
  const { db, close } = database();
  try {
    const input = {
      category: 'unknown',
      data: {
        source: 'reported',
        priority: 'P2',
        asset: 'sensor-api',
        evidence: 'ENOTFOUND sensor.internal',
      },
    };
    const t = await addTicket(
      db,
      'owner',
      'Sensor data not arriving',
      'No readings since deployment',
      input,
    );
    const analyzed = await transitionTicket(db, 'owner', t.id, 'analyze', 1);
    assert.equal(analyzed.incident.analysis.matches[0].id, 'dns');
    await assert.rejects(
      () =>
        transitionTicket(db, 'other', t.id, 'comment', 2, {
          text: 'Unauthorized',
        }),
      (e) => e.status === 404,
    );
    const results = await Promise.allSettled([
      transitionTicket(db, 'owner', t.id, 'comment', 2, {
        text: 'Compared the configured hostname.',
      }),
      transitionTicket(db, 'owner', t.id, 'resolve', 2, {
        text: 'Corrected hostname and verified readings arrive.',
      }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const saved = (await listTickets(db, 'owner'))[0];
    assert.equal(saved.revision, 3);
    assert.equal(saved.incident.evidence, input.data.evidence);
    assert.equal(saved.incident.priority, 'P2');
  } finally {
    close();
  }
});
