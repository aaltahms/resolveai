import test from 'node:test';
import assert from 'node:assert/strict';
import {
  probeInventory,
  inventoryBrief,
} from '../local-lab/inventory-probe.mjs';
test('inventory adapter requires independent matching read-back, not just HTTP success', async () => {
  let id;
  const sample = await probeInventory(async (url, options) => {
    if (url.endsWith('/ready')) return Response.json({ ready: true });
    if (options.method === 'POST') {
      id = JSON.parse(options.body).sku;
      return Response.json({ sku: id }, { status: 201 });
    }
    return Response.json({
      sku: 'different',
      name: 'ResolveAI integration check',
    });
  });
  assert.equal(sample.ok, false);
  assert.equal(sample.trace.length, 0);
});
test('inventory brief does not infer private database settings from generic storage errors', () => {
  const samples = Array.from({ length: 3 }, () => ({
    ok: false,
    detail:
      'Inventory readiness HTTP 200; create item HTTP 503; error=storage_unavailable',
  }));
  assert.match(inventoryBrief(samples).description, /does not disclose/);
  assert.doesNotMatch(
    inventoryBrief(samples).description,
    /read.only|query_only/,
  );
  samples[0].ok = true;
  assert.match(inventoryBrief(samples).title, /need investigation/);
});
