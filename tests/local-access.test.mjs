import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedHost, sameOrigin } from '../local-lab/local-access.mjs';
test('named and numeric loopback addresses require their own exact origin', () => {
  for (const host of ['127.0.0.1:4318', 'resolveai.localhost:4318']) {
    assert.ok(allowedHost(host));
    assert.ok(sameOrigin({ host, origin: `http://${host}` }));
    for (const origin of [
      undefined,
      'null',
      'https://evil.example',
      'http://resolveai.localhost:4318.evil.example',
      'http://resolveai.localhost:3000',
    ])
      assert.equal(sameOrigin({ host, origin }), false);
  }
  assert.equal(
    sameOrigin({
      host: 'resolveai.localhost:4318',
      origin: 'http://127.0.0.1:4318',
    }),
    false,
  );
  for (const host of [
    undefined,
    'localhost:4318',
    'evil.example:4318',
    'resolveai.localhost:4318.evil.example',
    '192.168.0.1:4318',
  ])
    assert.equal(allowedHost(host), false);
});
