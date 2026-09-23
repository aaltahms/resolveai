import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  repairCandidate,
  repairController,
  verifyOwnedService,
} from '../local-lab/repair.mjs';
const snapshot = () => ({
  revision: 1,
  running: true,
  pid: 42,
  queryOnly: true,
  locked: false,
  delay: 0,
});
const samples = (now = Date.now()) =>
  [0, 1, 2].map((i) => ({
    requestId: 'request-' + i,
    revision: 1,
    at: new Date(now - i * 1000).toISOString(),
    ok: false,
    detail: 'write/read-back HTTP 503',
    trace: [
      {
        requestId: 'request-' + i,
        stage: 'database',
        status: 'failed',
        queryOnly: true,
      },
    ],
  }));
test('a process exit during execution leaves an interrupted record and never replays the action', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'resolveai-repair-'));
  const path = join(directory, 'audit.sqlite');
  const script = `import {repairController} from ${JSON.stringify(new URL('../local-lab/repair.mjs', import.meta.url).href)};
    const s=${snapshot.toString()};const observations=${samples.toString()};
    const c=repairController({path:process.argv[1],inspect:async()=>s(),samples:observations,execute:async()=>process.exit(17),verify:async()=>({ok:true})});
    const p=await c.plan();await c.approve(p.id);`;
  try {
    const crashed = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script, path],
      { encoding: 'utf8' },
    );
    assert.equal(crashed.status, 17, crashed.stderr);
    let actions = 0;
    const c = repairController({
      path,
      inspect: async () => snapshot(),
      samples,
      execute: async () => {
        actions++;
      },
      verify: async () => ({ ok: true }),
    });
    try {
      const p = c.history()[0];
      assert.equal(p.status, 'interrupted');
      assert.equal((await c.approve(p.id)).status, 'interrupted');
      assert.equal(actions, 0);
    } finally {
      c.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('repair requires fresh consistent evidence and refuses mixed faults', () => {
  const now = Date.now();
  assert.equal(
    repairCandidate(samples(now), snapshot(), now).action,
    'enable-writes',
  );
  assert.throws(
    () => repairCandidate(samples(now).slice(0, 2), snapshot(), now),
    /three fresh/,
  );
  assert.throws(
    () => repairCandidate(samples(now - 13000), snapshot(), now),
    /three fresh/,
  );
  assert.throws(
    () => repairCandidate(samples(now), { ...snapshot(), revision: 2 }, now),
    /three fresh/,
  );
  assert.throws(
    () => repairCandidate(samples(now), { ...snapshot(), locked: true }, now),
    /No supported repair/,
  );
});
test('approval executes once and only fresh independent verification yields verified', async () => {
  let actions = 0,
    checks = 0;
  const c = repairController({
    path: ':memory:',
    inspect: async () => snapshot(),
    samples,
    execute: async () => {
      actions++;
    },
    verify: async () => ({ ok: ++checks !== 2 }),
  });
  try {
    const p = await c.plan();
    const result = await c.approve(p.id);
    assert.equal(result.status, 'failed');
    assert.equal(result.verification.length, 3);
    await c.approve(p.id);
    assert.equal(actions, 1);
    assert.equal(checks, 3);
  } finally {
    c.close();
  }
});
test('changed preconditions invalidate the approved plan before execution', async () => {
  let s = snapshot(),
    actions = 0;
  const c = repairController({
    path: ':memory:',
    inspect: async () => s,
    samples,
    execute: async () => {
      actions++;
    },
    verify: async () => ({ ok: true }),
  });
  try {
    const p = await c.plan();
    s = { ...s, revision: 2 };
    await assert.rejects(c.approve(p.id), /conditions changed/);
    assert.equal(actions, 0);
    assert.equal(c.history()[0].status, 'expired');
  } finally {
    c.close();
  }
});
test('concurrent approvals cannot execute two repairs', async () => {
  let release,
    actions = 0;
  const gate = new Promise((r) => {
    release = r;
  });
  const c = repairController({
    path: ':memory:',
    inspect: async () => snapshot(),
    samples,
    execute: async () => {
      actions++;
      await gate;
    },
    verify: async () => ({ ok: true }),
  });
  try {
    const p = await c.plan();
    const first = c.approve(p.id);
    await assert.rejects(c.approve(p.id), /already running/);
    release();
    assert.equal((await first).status, 'verified');
    assert.equal(actions, 1);
  } finally {
    c.close();
  }
});
test('verification rejects successful HTTP responses that do not contain the saved record', async () => {
  let calls = 0;
  const result = await verifyOwnedService(async (url, options) => {
    calls++;
    return new Response(
      JSON.stringify(
        options
          ? { record: { id: JSON.parse(options.body).id } }
          : { recent: [] },
      ),
      { status: options ? 201 : 200 },
    );
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 2);
});
