import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretNetwork } from '../local-lab/network.mjs';
test('Successful HTTPS checks do not claim the whole computer is healthy', () => {
  const result = interpretNetwork({
    connected: true,
    dns: [{ ok: false }, { ok: false }],
    sites: [{ ok: true }, { ok: true }],
  });
  assert.match(result.title, /reach the internet/);
  assert.match(result.explanation, /may still exist/);
});
test('Offline, failed lookups and partial reachability lead to different next steps', () => {
  const base = {
    connected: true,
    dns: [{ ok: false }, { ok: false }],
    sites: [{ ok: false }, { ok: false }],
  };
  assert.match(
    interpretNetwork({ ...base, connected: false }).next,
    /System Settings/,
  );
  assert.match(interpretNetwork(base).title, /lookups/);
  assert.match(
    interpretNetwork({
      ...base,
      dns: [{ ok: true }],
      sites: [{ ok: true }, { ok: false }],
    }).title,
    /some websites/,
  );
});
test('missing checks cannot report success; HTTPS success outweighs failed direct DNS', () => {
  assert.match(
    interpretNetwork({ connected: true, dns: [], sites: [] }).title,
    /incomplete/,
  );
  assert.match(
    interpretNetwork({
      connected: true,
      dns: [{ ok: false }, { ok: false }],
      sites: [{ ok: true }, { ok: false }],
    }).title,
    /some websites/,
  );
});
test('HTTPS errors and timeouts become bounded failed observations', async () => {
  const { reach } = await import('../local-lab/network.mjs');
  const { EventEmitter } = await import('node:events');
  for (const mode of ['error', 'timeout']) {
    const transport = {
      request() {
        const request = new EventEmitter();
        request.end = () =>
          queueMicrotask(() => request.emit(mode, new Error('fixture')));
        request.destroy = (error) => request.emit('error', error);
        return request;
      },
    };
    assert.equal((await reach('example.com', transport, 10)).ok, false);
  }
});
test('network orchestration passes only fixed hosts and shares concurrent checks', async () => {
  const { checkNetwork } = await import('../local-lab/network.mjs');
  const options = {
    interfaces: () => ({ en0: [{ internal: false, address: '192.0.2.1' }] }),
    lookup: async () => {
      throw Error('fixture');
    },
    connect: async (...args) => {
      assert.equal(args.length, 1);
      assert.ok(['example.com', 'www.apple.com'].includes(args[0]));
      return { host: args[0], ok: true };
    },
  };
  const first = checkNetwork(options);
  assert.equal(checkNetwork(options), first);
  const result = await first;
  assert.equal(result.sites.length, 2);
  assert.match(result.title, /reach the internet/);
});
test('unavailable interface access is not a disconnected observation', async () => {
  const { checkNetwork } = await import('../local-lab/network.mjs');
  const result = await checkNetwork({
    interfaces: () => {
      throw Error('denied');
    },
    lookup: async () => [],
    connect: async (host) => ({ host, ok: false }),
  });
  assert.equal(result.connected, null);
  assert.doesNotMatch(result.title, /not be connected|is connected/);
});
