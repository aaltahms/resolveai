import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { durableInventory } from '../local-lab/durable-inventory.mjs';
import {
  deliverCollectorEvent,
  validateCollectorEvent,
} from '../lib/collector-store.ts';
import { listTickets } from '../lib/ticket-store.ts';
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

test('durable queue survives restart after server commits but response is lost', async () => {
  const { db, close } = database();
  const dir = mkdtempSync(join(tmpdir(), 'resolveai-outbox-'));
  const path = join(dir, 'state.sqlite');
  let ok = false,
    loseReply = true;
  const probe = async () => ({
    ok,
    requestId: crypto.randomUUID(),
    at: new Date().toISOString(),
    detail: ok
      ? 'created and read'
      : 'Inventory readiness HTTP 200; create item HTTP 503; error=storage_unavailable',
  });
  const deliver = async (e) => {
    await deliverCollectorEvent(db, 'owner', e);
    if (loseReply) throw Error('Response lost after commit');
  };
  let m = durableInventory({ path, probe, deliver });
  try {
    for (let i = 0; i < 3; i++) await m.tick();
    assert.equal(m.snapshot().pending, 1);
    assert.equal((await listTickets(db, 'owner')).length, 1);
    m.close();
    m = durableInventory({ path, probe, deliver });
    loseReply = false;
    await m.tick();
    assert.equal(m.snapshot().pending, 0);
    assert.equal((await listTickets(db, 'owner')).length, 1);
    ok = true;
    loseReply = true;
    for (let i = 0; i < 3; i++) await m.tick();
    assert.equal(m.snapshot().pending, 1);
    assert.equal((await listTickets(db, 'owner'))[0].revision, 2);
    m.close();
    m = durableInventory({ path, probe, deliver });
    loseReply = false;
    await m.tick();
    const t = (await listTickets(db, 'owner'))[0];
    assert.equal(t.revision, 2);
    assert.equal(
      t.events.filter((e) => e.title === 'Inventory recovery verified').length,
      1,
    );
    assert.equal(m.snapshot().pending, 0);
  } finally {
    m.close();
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('outage and recovery remain queued in order while incident desk is offline', async () => {
  const { db, close } = database();
  const dir = mkdtempSync(join(tmpdir(), 'resolveai-offline-'));
  let online = false,
    ok = false;
  const settings = {
    path: join(dir, 'state.sqlite'),
    probe: async () => ({
      ok,
      requestId: crypto.randomUUID(),
      at: new Date().toISOString(),
      detail: 'check',
    }),
    deliver: async (e) => {
      if (!online) throw Error('offline');
      await deliverCollectorEvent(db, 'owner', e);
    },
  };
  let m = durableInventory(settings);
  try {
    for (let i = 0; i < 3; i++) await m.tick();
    ok = true;
    for (let i = 0; i < 3; i++) await m.tick();
    assert.equal(m.snapshot().pending, 2);
    m.close();
    m = durableInventory(settings);
    online = true;
    await m.tick();
    const tickets = await listTickets(db, 'owner');
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].revision, 2);
    assert.equal(m.snapshot().pending, 0);
  } finally {
    m.close();
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('collector rejects conflicting replays and scopes episodes to authenticated owners', async () => {
  const { db, close } = database();
  try {
    const event = {
      episode: crypto.randomUUID(),
      phase: 'outage',
      title: 'Inventory saves failed',
      description: 'Observed failure',
      evidence: 'HTTP 503',
    };
    const results = await Promise.all([
      deliverCollectorEvent(db, 'a', event),
      deliverCollectorEvent(db, 'a', event),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.equal((await listTickets(db, 'a')).length, 1);
    assert.equal((await listTickets(db, 'b')).length, 0);
    await assert.rejects(
      () => deliverCollectorEvent(db, 'a', { ...event, evidence: 'changed' }),
      (e) => e.status === 409,
    );
    await assert.rejects(
      () =>
        deliverCollectorEvent(db, 'b', {
          episode: event.episode,
          phase: 'recovery',
          evidence: 'success',
        }),
      (e) => e.status === 409,
    );
    assert.throws(() => validateCollectorEvent({ ...event, episode: 'bad' }));
    assert.throws(() =>
      validateCollectorEvent({ ...event, extra: 'unsupported' }),
    );
  } finally {
    close();
  }
});

test('Chrome reports create a separate ticket and repeated delivery is idempotent', async () => {
  const { db, close } = database();
  try {
    const event = validateCollectorEvent({
      episode: crypto.randomUUID(),
      channel: 'chrome',
      phase: 'outage',
      title: 'Chrome capture: a page request failed',
      description: 'Browser evidence only; backend cause unknown.',
      evidence: 'POST /submit — HTTP 503 — 25 ms',
    });
    const first = await deliverCollectorEvent(db, 'chrome-owner', event);
    const second = await deliverCollectorEvent(db, 'chrome-owner', event);
    assert.equal(first.id, 'CHR-' + event.episode);
    assert.equal(second.id, first.id);
    assert.equal(second.revision, first.revision);
  } finally {
    close();
  }
});
