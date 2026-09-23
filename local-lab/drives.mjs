import { execFile } from 'node:child_process';
const validId = /^disk\d+(?:s\d+)*$/;
// Arguments come only from a bounded OS inventory, never from requests.
function execute(file, args, input) {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { timeout: 2000, maxBuffer: 262144, encoding: 'utf8' },
      (error, stdout) => resolve(error ? null : stdout),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
export async function readDisk(args) {
  const plist = await execute('/usr/sbin/diskutil', args);
  if (plist === null) return null;
  const json = await execute(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', '-'],
    plist,
  );
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
export async function inventory(read = readDisk) {
  const list = await read(['list', '-plist', 'external']);
  if (!Array.isArray(list?.AllDisks)) return null;
  const ids = [
    ...new Set(
      list.AllDisks.filter((id) => typeof id === 'string' && validId.test(id)),
    ),
  ];
  const readings = await Promise.all(
    ids.slice(0, 16).map((id) => read(['info', '-plist', id])),
  );
  return {
    readings,
    partial:
      ids.length > 16 ||
      ids.length !== list.AllDisks.length ||
      readings.some((item) => !item || typeof item !== 'object'),
  };
}
const flag = (value) => (typeof value === 'boolean' ? value : null);
export function driveResult(kind, snapshot) {
  const evidence = [
    'Read-only disk inventory. No files are opened or written; disks are not mounted, repaired, erased, or ejected. Write flags cannot prove your account or app can save a file.',
  ];
  let images = 0;
  const volumes = [];
  let uncertain = snapshot?.partial || false;
  for (const item of snapshot?.readings || []) {
    if (!item || typeof item !== 'object') continue;
    if (item.BusProtocol === 'Disk Image') {
      images++;
      continue;
    }
    if (item.Internal !== false) {
      uncertain = true;
      continue;
    }
    const name =
      typeof item.VolumeName === 'string'
        ? item.VolumeName.slice(0, 100)
        : null;
    if (!name) {
      evidence.push(
        'An external disk or container was listed without a named volume. Compare Disk Utility → View → Show All Devices.',
      );
      continue;
    }
    const mounted =
      typeof item.MountPoint === 'string' ? item.MountPoint.length > 0 : null;
    const writable = flag(item.WritableVolume) ?? flag(item.Writable);
    const space =
      Number.isFinite(item.FreeSpace) && item.FreeSpace >= 0
        ? `${(item.FreeSpace / 1024 ** 3).toFixed(1)} GB available`
        : 'available space unknown';
    const state =
      writable === false
        ? 'reported read-only'
        : writable === true
          ? 'reported writable'
          : 'write status unknown';
    volumes.push({ name, state, mounted, space });
    evidence.push(
      `${name}: ${mounted === true ? 'mounted' : mounted === false ? 'not mounted' : 'mount status unknown'}; ${state}; ${space}.`,
    );
  }
  if (images)
    evidence.push('Disk images were excluded from the external-volume list.');
  if (uncertain)
    evidence.push(
      'Inventory is incomplete: some entries could not be classified or read, or the 16-entry limit was reached.',
    );
  const unavailable = !snapshot;
  return {
    title: unavailable
      ? 'External storage could not be read'
      : volumes.length
        ? `${volumes.length} external volume(s) listed`
        : 'No named external volumes confirmed',
    explanation: unavailable
      ? 'macOS or the launch environment did not provide a usable disk inventory. This does not mean the drive is absent.'
      : volumes.length
        ? 'Compare the listed volume with the drive you intended. A writable flag is not a successful save test.'
        : 'A disk may be disconnected, unmounted, locked, unsupported, or missing a readable volume. Installer disk images do not count as external storage here.',
    next:
      kind === 'drive-write' && volumes.length > 0
        ? 'Find the intended volume in the readings above. If it is read-only, check its format and lock state in Disk Utility. If writable, compare available space with the file size and inspect the app’s exact save error and folder permissions. Do not erase or reformat a drive to troubleshoot a save error. Recheck after your own next step.'
        : 'Open Disk Utility → View → Show All Devices and compare the device and its volumes. Check the drive’s power, cable, and adapter. A drive visible there may still be absent from Finder. If it contains important data and shows errors, record the message before attempting repairs. Recheck after checking the connection.',
    evidence,
    volumes,
    checkedAt: new Date().toISOString(),
  };
}
let pending;
export async function checkDrives(kind) {
  if (!pending)
    pending = inventory().finally(() => {
      pending = undefined;
    });
  return driveResult(kind, await pending);
}
