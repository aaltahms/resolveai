import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory, driveResult } from '../local-lab/drives.mjs';
test('unavailable inventory does not claim absent or healthy disks', () => {
  assert.match(driveResult('external-drive', null).title, /could not be read/);
});
test('projects volume metadata without paths, identifiers or UUIDs', () => {
  const result = driveResult('drive-write', {
    readings: [
      {
        Internal: false,
        VolumeName: 'Backup',
        MountPoint: '/Volumes/private',
        WritableVolume: false,
        FreeSpace: 1024 ** 3,
        DeviceIdentifier: 'disk99',
        VolumeUUID: 'secret',
      },
    ],
  });
  assert.equal(result.volumes[0].state, 'reported read-only');
  assert.equal(result.volumes[0].space, '1.0 GB available');
  assert.doesNotMatch(JSON.stringify(result), /private|disk99|secret/);
});
test('disk images and unclassified disks are excluded without claiming absence', () => {
  const result = driveResult('external-drive', {
    readings: [
      { Internal: false, BusProtocol: 'Disk Image', VolumeName: 'Installer' },
      { VolumeName: 'Unknown' },
    ],
  });
  assert.equal(result.volumes.length, 0);
  assert.match(result.evidence.join(' '), /incomplete/);
});
test('unknown flags remain unknown and no free space is invented', () => {
  const result = driveResult('drive-write', {
    readings: [
      { Internal: false, VolumeName: 'USB', Writable: 'true', FreeSpace: -1 },
    ],
  });
  assert.equal(result.volumes[0].state, 'write status unknown');
  assert.equal(result.volumes[0].mounted, null);
  assert.equal(result.volumes[0].space, 'available space unknown');
});
test('inventory bounds OS-derived identifiers and marks partial data', async () => {
  const calls = [];
  const result = await inventory(async (args) => {
    calls.push(args);
    return args[0] === 'list'
      ? {
          AllDisks: [
            'invalid;command',
            ...Array.from({ length: 20 }, (_, i) => `disk${i}`),
          ],
        }
      : null;
  });
  assert.equal(calls.length, 17);
  assert.equal(result.partial, true);
  assert.ok(calls.slice(1).every((args) => /^disk\d+$/.test(args[2])));
});
test('malformed list is unavailable; empty list is a valid observation', async () => {
  assert.equal(await inventory(async () => ({})), null);
  assert.deepEqual(await inventory(async () => ({ AllDisks: [] })), {
    readings: [],
    partial: false,
  });
});
