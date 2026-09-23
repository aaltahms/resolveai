import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBattery,
  parseAudio,
  parseDisplays,
  interpretBattery,
  interpretAudio,
  interpretDisplays,
  hardwareResult,
} from '../local-lab/hardware-checks.mjs';
import { checkMac, runCommand } from '../local-lab/mac-checks.mjs';
const battery = (state, source = 'AC Power', percent = 67) =>
  `Now drawing from '${source}'\n -InternalBattery-0 (id=SECRET)\t${percent}%; ${state}; 1:36 remaining present: true`;
const audio = (items) =>
  JSON.stringify({ SPAudioDataType: [{ _items: items }] });
const display = (items) =>
  JSON.stringify({ SPDisplaysDataType: [{ spdisplays_ndrvs: items }] });
test('battery distinguishes charging, charged, battery power, and paused charging', () => {
  assert.match(
    interpretBattery(parseBattery(battery('charging'))).title,
    /charging now/,
  );
  assert.match(
    interpretBattery(parseBattery(battery('charged', 'AC Power', 100))).title,
    /is charged/,
  );
  assert.match(
    interpretBattery(parseBattery(battery('discharging', 'Battery Power')))
      .title,
    /running on battery/,
  );
  const paused = interpretBattery(parseBattery(battery('not charging')));
  assert.match(paused.title, /not charging/);
  assert.match(paused.explanation, /cannot tell/);
  assert.doesNotMatch(
    JSON.stringify(
      hardwareResult('battery', { ok: true, text: battery('charging') }),
    ),
    /SECRET|InternalBattery/,
  );
});
test('missing battery and unknown state never imply battery failure', () => {
  assert.equal(parseBattery('denied'), null);
  assert.equal(parseBattery(battery('charging', 'AC Power', 101)), null);
  assert.match(
    interpretBattery(parseBattery("Now drawing from 'AC Power'")).title,
    /No battery percentage/,
  );
  assert.match(
    interpretBattery(parseBattery(battery('new-state'))).title,
    /unclear/,
  );
  assert.match(interpretBattery(null).title, /could not/);
});
test('audio only returns output labels and default flags, not microphones or IDs', () => {
  const outputs = parseAudio(
    audio([
      { _name: 'Private microphone', coreaudio_device_input: 1, UID: 'SECRET' },
      {
        _name: 'Speakers',
        coreaudio_device_output: 2,
        coreaudio_default_audio_output_device: 'spaudio_yes',
        UID: 'SECRET',
      },
    ]),
  );
  assert.deepEqual(outputs, [{ name: 'Speakers', isDefault: true }]);
  assert.match(interpretAudio(outputs).title, /Speakers/);
  assert.match(interpretAudio(outputs).explanation, /does not read mute/);
  assert.doesNotMatch(JSON.stringify(outputs), /Private|SECRET/);
});
test('audio malformed, empty, absent and ambiguous default are separate findings', () => {
  assert.equal(parseAudio('bad json'), null);
  assert.equal(parseAudio('{}'), null);
  assert.match(interpretAudio(null).title, /could not/);
  assert.match(interpretAudio([]).title, /No audio output/);
  for (const outputs of [
    [{ name: 'USB', isDefault: false }],
    [
      { name: 'A', isDefault: true },
      { name: 'B', isDefault: true },
    ],
  ])
    assert.match(interpretAudio(outputs).title, /unclear/);
});
test('displays preserve unknown connections and strip serial numbers', () => {
  const displays = parseDisplays(
    display([
      {
        _name: 'Panel',
        spdisplays_connection_type: 'spdisplays_internal',
        spdisplays_online: 'spdisplays_yes',
        _spdisplays_displayID: 'SECRET',
      },
      {
        _name: 'Monitor',
        spdisplays_connection_type: 'spdisplays_hdmi',
        spdisplays_online: 'spdisplays_no',
        serial: 'SECRET',
      },
    ]),
  );
  assert.deepEqual(displays, [
    { name: 'Panel', connection: 'built-in', online: true },
    { name: 'Monitor', connection: 'external', online: false },
  ]);
  assert.match(interpretDisplays(displays).explanation, /does not prove/);
  assert.doesNotMatch(JSON.stringify(displays), /SECRET/);
  assert.match(
    interpretDisplays(displays.slice(0, 1)).title,
    /Only a built-in/,
  );
  assert.match(
    interpretDisplays(
      parseDisplays(
        display([
          { _name: 'Virtual', spdisplays_connection_type: 'future_type' },
        ]),
      ),
    ).title,
    /unclear/,
  );
  for (const text of ['{}', 'null', 'malformed'])
    assert.equal(parseDisplays(text), null);
  assert.match(interpretDisplays([]).title, /could not/);
});
test('new checks preserve denied access, partial data and unsupported OS', async () => {
  for (const kind of ['battery', 'audio', 'displays']) {
    const first = checkMac(kind, {
      platform: 'darwin',
      run: async (name) => {
        assert.equal(name, kind);
        return { ok: false, reason: 'Deadline reached' };
      },
    });
    assert.equal(checkMac(kind), first);
    const result = await first;
    assert.match(result.title, /could not/);
    assert.match(result.evidence.join(' '), /Deadline/);
    assert.match((await checkMac(kind, { platform: 'linux' })).title, /macOS/);
    const partial = await checkMac(kind, {
      platform: 'darwin',
      run: async () => ({ ok: true, text: '{}' }),
    });
    assert.match(partial.title, /could not/);
  }
});
test('hardware inventory uses fixed commands and bounded timeout/output', async () => {
  for (const kind of ['audio', 'displays']) {
    const result = await runCommand(kind, (file, args, options, callback) => {
      assert.equal(file, '/usr/sbin/system_profiler');
      assert.ok(args.includes('-json'));
      assert.equal(options.timeout, 8000);
      assert.equal(options.maxBuffer, 262144);
      callback({ killed: true }, '');
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /8-second/);
  }
  await runCommand('battery', (file, args, options, callback) => {
    assert.equal(file, '/usr/bin/pmset');
    assert.deepEqual(args, ['-g', 'batt']);
    assert.equal(options.timeout, 3000);
    callback(null, battery('charging'));
  });
});
