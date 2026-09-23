import os from 'node:os';
import { checkDrives } from './drives.mjs';
import { checkPrinting } from './printing.mjs';
import { hardwareResult } from './hardware-checks.mjs';
import { execFile } from 'node:child_process';

// Only these fixed, read-only commands can be executed. No request supplies arguments.
const commands = {
  'print-service': ['/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-r']],
  printers: ['/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-p']],
  'print-default': ['/usr/bin/lpstat', ['-h', '127.0.0.1:631', '-d']],
  'print-jobs': [
    '/usr/bin/lpstat',
    ['-h', '127.0.0.1:631', '-W', 'not-completed', '-o'],
  ],
  battery: ['/usr/bin/pmset', ['-g', 'batt']],
  audio: [
    '/usr/sbin/system_profiler',
    ['SPAudioDataType', '-json', '-detailLevel', 'mini'],
    8000,
  ],
  displays: [
    '/usr/sbin/system_profiler',
    ['SPDisplaysDataType', '-json', '-detailLevel', 'mini'],
    8000,
  ],
  pressure: ['/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']],
  processes: [
    '/bin/ps',
    ['-U', String(process.getuid?.() ?? 0), '-o', 'pid=,pcpu=,rss=,comm='],
  ],
  storage: ['/bin/df', ['-k', '/System/Volumes/Data']],
};
export function runCommand(name, execute = execFile) {
  const spec = commands[name];
  if (!spec) throw Error('Unknown check');
  return new Promise((resolve) =>
    execute(
      spec[0],
      spec[1],
      {
        timeout: spec[2] || 3000,
        maxBuffer: 256 * 1024,
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin:/usr/sbin', LC_ALL: 'C' },
      },
      (error, stdout) =>
        resolve(
          error
            ? {
                ok: false,
                reason: error.killed
                  ? `The check exceeded its ${(spec[2] || 3000) / 1000}-second deadline.`
                  : 'macOS or the launch environment did not allow this check to complete.',
              }
            : { ok: true, text: stdout },
        ),
    ),
  );
}
export function parseStorage(text) {
  const row = text.trim().split('\n').at(-1)?.trim().split(/\s+/);
  const total = Number(row?.[1]) * 1024,
    available = Number(row?.[3]) * 1024;
  return Number.isFinite(total) &&
    total > 0 &&
    Number.isFinite(available) &&
    available >= 0 &&
    available <= total
    ? { total, available }
    : null;
}
export function parseProcesses(text) {
  return text
    .split('\n')
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
      if (!match) return [];
      // Return executable names only, never command arguments or full private paths.
      const name = (
        match[4].match(/([^/]+)\.app\//)?.[1] || match[4].split('/').at(-1)
      ).slice(0, 80);
      return [
        {
          pid: Number(match[1]),
          cpu: Number(match[2]),
          memory: Number(match[3]) * 1024,
          app: /\.app\//.test(match[4]),
          name,
        },
      ];
    })
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 500);
}
const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
export function interpretStorage(storage) {
  if (!storage)
    return {
      title: 'Storage could not be read',
      explanation:
        'The available space on the Mac’s Data volume could not be measured.',
      next: 'Open System Settings → General → Storage to review available space. If ResolveAI was launched in a restricted environment, launch it from Terminal and check again.',
    };
  const low =
    storage.available < 10 * 1024 ** 3 ||
    storage.available / storage.total < 0.1;
  return {
    title: low
      ? 'Available storage is running low'
      : 'There is room on the Data volume',
    explanation: `${gb(storage.available)} is available out of ${gb(storage.total)}. ${low ? 'Limited space can interfere with downloads, updates, and temporary files; this does not prove it caused your symptom.' : 'This snapshot does not point to low space on this volume. An app may use another disk or have its own quota.'}`,
    next: low
      ? 'Open System Settings → General → Storage. Review large items and move files you recognize to another disk if appropriate. Review Trash before emptying it, then check again. ResolveAI does not delete anything.'
      : 'If a save or download still fails, check the destination disk, the size of the file, and the app’s exact error. Check again after your next attempt.',
  };
}
export function interpretPerformance({ cpu, pressure, processes }) {
  const elevated = pressure === 2 || pressure === 4;
  const busy = cpu !== null && cpu >= 85;
  return {
    title: elevated
      ? 'Memory pressure is elevated'
      : busy
        ? 'Your Mac was busy during this check'
        : cpu === null && pressure === null
          ? 'Performance checks are incomplete'
          : 'No clear system-wide bottleneck in this snapshot',
    explanation: elevated
      ? 'macOS reported memory pressure. This can contribute to slowdowns, but does not identify one app as the cause.'
      : busy
        ? 'At least 85% of total CPU capacity was active over one second. A short burst is normal during work; it is not proof that an app is stuck.'
        : 'A brief sample can miss intermittent slowdowns, disk activity, heat, and app-specific issues. Unavailable readings are not evidence of normal performance.',
    next: elevated
      ? 'Save your work, then close unneeded tabs or apps normally. Open Activity Monitor → Memory to compare its Memory Pressure graph, then check again.'
      : busy
        ? `Wait for ongoing work to finish, then check again. Open Activity Monitor → CPU to see whether activity stays high.${processes?.length ? ' The optional details list the busiest visible processes.' : ''}`
        : 'Reproduce the slowdown and check again. In Activity Monitor, compare CPU and Memory while it happens. If only one app is affected, use “An app isn’t responding” below.',
  };
}
function cpuSnapshot() {
  return os.cpus().map((c) => ({
    idle: c.times.idle,
    total: Object.values(c.times).reduce((a, b) => a + b, 0),
  }));
}
export function cpuUsage(before, after) {
  if (!before.length || before.length !== after.length) return null;
  const total = after.reduce((sum, c, i) => sum + c.total - before[i].total, 0),
    idle = after.reduce((sum, c, i) => sum + c.idle - before[i].idle, 0);
  return total > 0 && idle >= 0 && idle <= total
    ? Math.round(100 * (1 - idle / total))
    : null;
}
const pending = new Map();
export function checkMac(
  kind,
  {
    platform = os.platform(),
    run = runCommand,
    sample = cpuSnapshot,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  if (
    ![
      'external-drive',
      'drive-write',
      'printer-missing',
      'print-queue',
      'printer-default',
      'storage',
      'performance',
      'apps',
      'battery',
      'audio',
      'displays',
    ].includes(kind)
  )
    throw Error('Unknown check');
  if (pending.has(kind)) return pending.get(kind);
  const job = (async () => {
    if (platform !== 'darwin')
      return {
        title: 'This check needs macOS',
        explanation: 'ResolveAI is running on a host that is not a Mac.',
        next: 'Run the local service on the Mac you want to check.',
        evidence: [],
        checkedAt: new Date().toISOString(),
      };
    if (['external-drive', 'drive-write'].includes(kind))
      return checkDrives(kind);
    if (['printer-missing', 'print-queue', 'printer-default'].includes(kind))
      return checkPrinting(kind, run);
    if (['battery', 'audio', 'displays'].includes(kind))
      return hardwareResult(kind, await run(kind));
    const evidence = [];
    if (kind === 'storage') {
      const result = await run('storage'),
        storage = result.ok ? parseStorage(result.text) : null;
      evidence.push(
        storage
          ? `Data volume: ${gb(storage.available)} available of ${gb(storage.total)}. APFS volumes share capacity; this is not a scan of your files.`
          : result.reason || 'Storage output was not recognized.',
      );
      return {
        ...interpretStorage(storage),
        evidence,
        checkedAt: new Date().toISOString(),
      };
    }
    const [p, m, cpu] = await Promise.all([
      run('processes'),
      run('pressure'),
      (async () => {
        try {
          const before = sample();
          await wait(1000);
          return cpuUsage(before, sample());
        } catch {
          return null;
        }
      })(),
    ]);
    const processes = p.ok ? parseProcesses(p.text) : [];
    const pressure =
      m.ok && ['1', '2', '4'].includes(m.text.trim())
        ? Number(m.text.trim())
        : null;
    evidence.push(
      cpu === null
        ? 'CPU sample unavailable.'
        : `Total CPU activity: ${cpu}% over one second.`,
      pressure === null
        ? `Memory pressure unavailable. ${m.reason || 'The OS reading was not recognized.'} Open Activity Monitor → Memory for its pressure graph.`
        : `macOS memory pressure: ${{ 1: 'normal', 2: 'warning', 4: 'critical' }[pressure]}.`,
      processes.length
        ? 'Process CPU is an OS-reported activity estimate, not the one-second system sample. Memory is resident size, not memory pressure. Up to 500 processes owned by the launch user. Names only; no arguments or full paths.'
        : `Process list unavailable or empty. ${p.reason || ''} Open Activity Monitor to select your app. A restricted launcher may block this check; no extra permissions are requested.`,
    );
    return {
      ...(kind === 'performance'
        ? interpretPerformance({ cpu, pressure, processes })
        : {
            title: processes.length
              ? 'Choose the app you’re having trouble with'
              : 'App activity could not be read',
            explanation:
              'ResolveAI can check whether a process is visible and report its activity. These readings cannot test whether its window responds or prove an app is hung.',
            next: 'Try switching to the app and using a harmless menu. If it responds, save your work. If it stays frozen, open Activity Monitor and look for “Not Responding”. Wait for ongoing work before choosing to quit; Force Quit can lose unsaved work. ResolveAI never quits apps.',
          }),
      evidence,
      processes,
      checkedAt: new Date().toISOString(),
    };
  })().finally(() => pending.delete(kind));
  pending.set(kind, job);
  return job;
}
