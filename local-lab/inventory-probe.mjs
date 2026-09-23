// Adapter for a separate application's HTTP contract. No internal trace access.
export async function probeInventory(fetcher = fetch) {
  const requestId = crypto.randomUUID(),
    started = performance.now();
  let health;
  const call = (path, options = {}) =>
    fetcher('http://127.0.0.1:4321' + path, {
      ...options,
      signal: AbortSignal.timeout(1500),
    });
  try {
    health = await call('/ready');
    const written = await call('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: requestId,
        name: 'ResolveAI integration check',
      }),
    });
    if (!written.ok) {
      const error = await written.json();
      return {
        ok: false,
        requestId,
        trace: [],
        at: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - started),
        detail: `Inventory readiness HTTP ${health.status}; create item HTTP ${written.status}; error=${String(error.error || 'unknown').slice(0, 160)}`,
      };
    }
    const found = await call('/items/' + requestId);
    const item = await found.json();
    return {
      ok:
        health.ok &&
        found.ok &&
        item.sku === requestId &&
        item.name === 'ResolveAI integration check',
      requestId,
      trace: [],
      at: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - started),
      detail: `Inventory readiness HTTP ${health.status}; create item HTTP ${written.status}; independent item read HTTP ${found.status}; content matched=${item.sku === requestId && item.name === 'ResolveAI integration check'}`,
    };
  } catch (e) {
    return {
      ok: false,
      requestId,
      trace: [],
      at: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - started),
      detail: `Inventory readiness ${health?.status ?? 'unavailable'}; request failed ${e.cause?.code || e.name}`,
    };
  }
}

export function inventoryBrief(samples) {
  const failed =
    samples.length >= 3 &&
    samples
      .slice(0, 3)
      .every(
        (s) =>
          !s.ok &&
          s.detail.includes(
            'readiness HTTP 200; create item HTTP 503; error=storage_unavailable',
          ),
      );
  return failed
    ? {
        title: 'Inventory item creation fails while readiness succeeds',
        description:
          'Impact: inventory creation checks failed. Observed: readiness succeeds but item creation returns storage_unavailable. Next check: inspect the inventory service storage logs and configuration. Not established: the external API does not disclose the underlying storage failure. No internal traces are available to this collector.',
      }
    : {
        title: 'Inventory functional checks need investigation',
        description:
          'The available external observations do not consistently establish the failure boundary. Review the attached request results and collect service logs before selecting a fix.',
      };
}
