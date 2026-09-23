import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  addTicket,
  listTickets,
  transitionTicket,
} from '../lib/ticket-store.ts';
import {
  investigateAI,
  aiBudget,
  validateAI,
  aiRequest,
  requestAI,
} from '../lib/ai.ts';
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    readFileSync(
      new URL('../drizzle/0000_vengeful_earthquake.sql', import.meta.url),
      'utf8',
    ),
  );
  sql.exec(
    readFileSync(
      new URL(
        '../drizzle/0001_concerned_mulholland_black.sql',
        import.meta.url,
      ),
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

const result = {
  summary: 'DNS lookup failed; cause needs investigation.',
  hypotheses: [
    {
      cause: 'Name cannot be resolved',
      evidenceLines: [1],
      check: 'Compare the configured hostname with DNS records.',
    },
  ],
  missingInformation: [],
  verification: ['Confirm a successful lookup.'],
};
const reply = async () =>
  Response.json({
    status: 'completed',
    output: [
      { content: [{ type: 'output_text', text: JSON.stringify(result) }] },
    ],
  });
test('guided suggestions cannot become evidence for an AI hypothesis', async () => {
  const ticket = {
    title: 'Printer',
    description: 'Test',
    incident: {
      asset: 'Mac',
      evidence:
        'Guided troubleshooting — user-reported observations\nSuggested next step: Restart the printer\nObservation: Not checked\nObservation: The queue says paused',
    },
  };
  const input = JSON.parse(aiRequest(ticket).input);
  assert.equal(input.evidence[1].kind, 'guidance-not-observed');
  assert.equal(input.evidence[2].kind, 'guidance-not-observed');
  assert.equal(input.evidence[3].kind, 'user-observation');
  await assert.rejects(requestAI(ticket, 'test', reply), /cited a guide/);
});
async function incident(db) {
  return addTicket(db, 'a', 'Sensor unavailable', 'Synthetic test', {
    category: 'network',
    data: {
      source: 'reported',
      priority: 'P2',
      asset: 'sensor',
      evidence: 'ENOTFOUND sensor.internal',
    },
  });
}
test('AI rejects invented line references and excessive input', () => {
  assert.throws(() =>
    validateAI(
      {
        ...result,
        hypotheses: [{ ...result.hypotheses[0], evidenceLines: [2] }],
      },
      1,
    ),
  );
  assert.throws(() =>
    aiRequest({
      title: 'x',
      description: 'x',
      incident: { asset: 'x', evidence: 'x'.repeat(26000) },
    }),
  );
});
test('duplicate AI clicks spend once and save one result', async () => {
  const { db, close } = database();
  try {
    const t = await incident(db);
    let calls = 0;
    const f = async () => {
      calls++;
      return reply();
    };
    const outcomes = await Promise.allSettled([
      investigateAI(db, 'a', t.id, 1, 'test', f),
      investigateAI(db, 'a', t.id, 1, 'test', f),
    ]);
    assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(calls, 1);
    assert.equal((await aiBudget(db)).reservedCents, 1);
    assert.equal(
      (await listTickets(db, 'a'))[0].incident.ai.summary,
      result.summary,
    );
  } finally {
    close();
  }
});
test('AI allowance is global, bounded, and failed requests remain counted', async () => {
  const { db, close } = database();
  try {
    const t = await incident(db);
    await assert.rejects(
      () => investigateAI(db, 'other', t.id, 1, 'test', reply),
      (e) => e.status === 404,
    );
    assert.equal((await aiBudget(db)).reservedCents, 0);
    await db
      .prepare('UPDATE ai_budget SET reserved_cents = ? WHERE id = ?')
      .bind(498, 'resolveai')
      .run();
    await assert.rejects(
      () =>
        investigateAI(
          db,
          'a',
          t.id,
          1,
          'test',
          async () => new Response('', { status: 429 }),
        ),
      (e) => e.status === 429,
    );
    assert.equal((await aiBudget(db)).reservedCents, 499);
    const next = await incident(db);
    let calls = 0;
    await assert.rejects(
      () =>
        investigateAI(db, 'a', next.id, 1, 'test', async () => {
          calls++;
          return reply();
        }),
      (e) => e.status === 409,
    );
    assert.equal(calls, 0);
  } finally {
    close();
  }
});
test('AI discards results when evidence changes during the request', async () => {
  const { db, close } = database();
  try {
    const t = await incident(db);
    await assert.rejects(
      () =>
        investigateAI(db, 'a', t.id, 1, 'test', async () => {
          await transitionTicket(db, 'a', t.id, 'evidence', 1, {
            text: 'New evidence',
          });
          return reply();
        }),
      (e) => e.status === 409,
    );
    const saved = (await listTickets(db, 'a'))[0];
    assert.equal(saved.incident.ai, undefined);
    assert.equal(saved.incident.evidence, 'New evidence');
    assert.equal((await aiBudget(db)).reservedCents, 1);
  } finally {
    close();
  }
});
