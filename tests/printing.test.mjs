import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrinterList,
  parseDefault,
  parseJobCounts,
  interpretPrinting,
  checkPrinting,
  printerFinding,
} from '../local-lab/printing.mjs';
import { checkMac, runCommand } from '../local-lab/mac-checks.mjs';
const ok = (text) => ({ ok: true, text });
const snapshot = () => ({
  service: ok('scheduler is running\n'),
  printers: ok(
    'printer Office is idle. enabled since yesterday\nprinter Lab disabled since yesterday -\n\tprivate device uri SECRET\n',
  ),
  default: ok('system default destination: Office\n'),
  jobs: ok(
    'Lab-42 PRIVATE_USER 2048 yesterday\nLab-43 PRIVATE_USER 1024 today\n',
  ),
});
test('printer states and jobs retain only names, states and counts', () => {
  const s = snapshot();
  assert.deepEqual(parsePrinterList(s.printers), [
    { name: 'Office', status: 'idle' },
    { name: 'Lab', status: 'paused' },
  ]);
  assert.equal(parseJobCounts(s.jobs).Lab, 2);
  const result = interpretPrinting('print-queue', s);
  assert.equal(result.printers[1].pending, 2);
  assert.match(result.printers[1].finding.title, /paused/);
  assert.doesNotMatch(
    JSON.stringify(result),
    /SECRET|PRIVATE_USER|Lab-42|yesterday|2048/,
  );
});
test('missing printers, no default and configured default have distinct next steps', () => {
  const s = snapshot();
  assert.match(interpretPrinting('printer-missing', s).title, /2 configured/);
  assert.match(interpretPrinting('printer-default', s).title, /Office/);
  const partial = { ...s, printers: { ok: false } };
  assert.match(interpretPrinting('printer-default', partial).title, /Office/);
  s.printers = ok('');
  assert.match(interpretPrinting('printer-missing', s).title, /No configured/);
  s.default = ok('no system default destination\n');
  assert.match(
    interpretPrinting('printer-default', s).title,
    /No system default/,
  );
  assert.equal(parseDefault(ok('unrecognized')).known, false);
});
test('pending jobs are not declared stuck and empty queue is not a successful print', () => {
  assert.match(
    printerFinding({ name: 'Office', status: 'idle', pending: 2 }).explanation,
    /cannot tell/,
  );
  assert.match(
    printerFinding({ name: 'Office', status: 'idle', pending: 0 }).explanation,
    /does not prove/,
  );
  assert.match(
    printerFinding({ name: 'Office', status: 'printing', pending: null }).title,
    /unavailable/,
  );
});
test('unavailable and malformed readings never become healthy or empty observations', () => {
  const s = snapshot();
  s.printers = { ok: false };
  s.service = ok('scheduler is not running');
  assert.match(interpretPrinting('printer-missing', s).title, /could not/);
  assert.equal(parsePrinterList(ok('unrecognized output')), null);
  assert.equal(parseJobCounts({ ok: false }), null);
  assert.equal(parseJobCounts(ok('broken output')), null);
  assert.equal(parsePrinterList({ ok: false }), null);
  assert.deepEqual(parseDefault({ ok: false }), { known: false, name: null });
  const partial = snapshot();
  partial.jobs = { ok: false };
  const result = interpretPrinting('print-queue', partial);
  assert.equal(result.printers[0].pending, null);
  assert.match(result.evidence.join(' '), /counts unavailable/);
});
test('printer identifiers cannot alter count object prototypes', () => {
  const counts = parseJobCounts(
    ok('__proto__-4 owner 100 time\nconstructor-5 owner 100 time\n'),
  );
  assert.equal(counts.__proto__, 1);
  assert.equal(counts.constructor, 1);
  assert.equal(Object.getPrototypeOf(counts), null);
});
test('printing routes share one bounded read-only snapshot while in flight', async () => {
  let calls = 0;
  const s = snapshot();
  const map = {
    'print-service': s.service,
    printers: s.printers,
    'print-default': s.default,
    'print-jobs': s.jobs,
  };
  const run = async (name) => {
    calls++;
    return map[name];
  };
  const results = await Promise.all(
    ['printer-missing', 'print-queue', 'printer-default'].map((kind) =>
      checkPrinting(kind, run),
    ),
  );
  assert.equal(calls, 4);
  assert.equal(results.length, 3);
  assert.match(results[2].title, /Office/);
  await assert.rejects(() => checkPrinting('arbitrary', run));
});
test('fixed print commands target only localhost and never mutate queues', async () => {
  for (const name of [
    'print-service',
    'printers',
    'print-default',
    'print-jobs',
  ])
    await runCommand(name, (file, args, options, cb) => {
      assert.equal(file, '/usr/bin/lpstat');
      assert.deepEqual(args.slice(0, 2), ['-h', '127.0.0.1:631']);
      assert.equal(options.timeout, 3000);
      if (name === 'print-jobs')
        assert.deepEqual(args.slice(2), ['-W', 'not-completed', '-o']);
      cb({ killed: true }, '');
    });
  for (const kind of ['printer-missing', 'print-queue', 'printer-default']) {
    const result = await checkMac(kind, {
      platform: 'darwin',
      run: async () => ({ ok: false, reason: 'Timed out' }),
    });
    assert.match(result.title, /could not/);
    assert.match((await checkMac(kind, { platform: 'linux' })).title, /macOS/);
  }
});
