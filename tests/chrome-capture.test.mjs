import test from 'node:test';
import assert from 'node:assert/strict';
import { safeRequest, collectorReport } from '../chrome-extension/report.js';
import { validateCollectorEvent } from '../lib/collector-store.ts';

test('capture strips secrets and excludes other origins and resource types', () => {
  const event = {
    url: 'http://127.0.0.1:4318/submit?token=SECRET#SECRET',
    type: 'xmlhttprequest',
    method: 'POST',
    timeStamp: 125,
    statusCode: 503,
    requestBody: 'SECRET',
    requestHeaders: ['SECRET'],
  };
  const row = safeRequest(event, 100);
  assert.deepEqual(row, {
    method: 'POST',
    path: '/submit',
    status: 503,
    durationMs: 25,
    failed: true,
  });
  assert.equal(
    safeRequest({ ...event, url: 'http://127.0.0.1:3000/submit' }, 100),
    null,
  );
  assert.equal(safeRequest({ ...event, type: 'image' }, 100), null);
  assert.equal(
    safeRequest({ ...event, url: 'http://127.0.0.1:4318/SECRET' }, 100).path,
    '[path omitted]',
  );
  const report = collectorReport({ id: crypto.randomUUID(), rows: [row] });
  assert.equal(validateCollectorEvent(report).channel, 'chrome');
  assert.ok(!JSON.stringify(report).includes('SECRET'));
  assert.throws(
    () => validateCollectorEvent({ ...report, phase: 'recovery' }),
    /do not verify recovery/,
  );
});

test('worker captures only selected tab, requires review approval, and stops recording', async () => {
  const listeners = {};
  let stored = {};
  const event = (name) => ({
    addListener(fn) {
      listeners[name] = fn;
    },
  });
  globalThis.chrome = {
    storage: {
      session: {
        async get() {
          return structuredClone(stored);
        },
        async set(value) {
          stored = structuredClone(value);
        },
        async remove() {
          stored = {};
        },
      },
    },
    webRequest: {
      onBeforeRequest: event('before'),
      onCompleted: event('complete'),
      onErrorOccurred: event('error'),
    },
    alarms: { onAlarm: event('alarm'), async create() {}, async clear() {} },
    tabs: {
      async query() {
        return [{ id: 7, url: 'http://127.0.0.1:4318/' }];
      },
      async create() {},
    },
    runtime: {
      id: 'test',
      getURL: (path) => 'chrome-extension://test/' + path,
      onMessage: event('message'),
    },
  };
  try {
    await import('../chrome-extension/worker.js');
    const popup = { id: 'test', url: 'chrome-extension://test/popup.html' };
    const page = { id: 'test', url: 'http://127.0.0.1:3000/' };
    const message = (type, sender = popup, extra = {}) =>
      new Promise((resolve) =>
        listeners.message({ type, ...extra }, sender, resolve),
      );
    assert.ok((await message('start', page)).error);
    const { capture } = await message('start');
    const d = {
      url: 'http://127.0.0.1:4318/submit',
      type: 'xmlhttprequest',
      method: 'POST',
      tabId: 8,
      requestId: 'a',
      timeStamp: 100,
    };
    listeners.before(d);
    listeners.complete({ ...d, timeStamp: 150, statusCode: 503 });
    assert.equal((await message('status')).capture.rows.length, 0);
    listeners.before({ ...d, tabId: 7 });
    listeners.complete({ ...d, tabId: 7, timeStamp: 150, statusCode: 503 });
    assert.equal((await message('status')).capture.rows.length, 1);
    assert.ok((await message('send')).error);
    assert.ok(
      (await message('deliver-report', page, { id: capture.id })).error,
    );
    await message('stop');
    listeners.before({ ...d, tabId: 7 });
    listeners.complete({ ...d, tabId: 7, statusCode: 200 });
    assert.equal((await message('status')).capture.rows.length, 1);
    await message('send');
    assert.equal(
      (await message('deliver-report', page, { id: capture.id })).report
        .channel,
      'chrome',
    );
    assert.ok(
      (
        await message(
          'deliver-report',
          { ...page, url: 'https://evil.example/' },
          { id: capture.id },
        )
      ).error,
    );
    await message('clear');
    assert.ok(
      (await message('deliver-report', page, { id: capture.id })).error,
    );
    await message('start');
    const background = {
      ...d,
      tabId: 7,
      method: 'GET',
      url: 'http://127.0.0.1:4318/state',
    };
    listeners.before(background);
    listeners.complete({ ...background, timeStamp: 150, statusCode: 200 });
    await message('stop');
    assert.match((await message('send')).error, /Only background checks/);
  } finally {
    delete globalThis.chrome;
  }
});
