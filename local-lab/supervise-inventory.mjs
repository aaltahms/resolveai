import { fileURLToPath } from 'node:url';
import { supervise } from './supervisor.mjs';
const controller = new AbortController();
for (const event of ['SIGINT', 'SIGTERM'])
  process.on(event, () => controller.abort());
console.log(
  'Inventory collector supervision started. Control-C stops the collector and supervisor.',
);
const result = await supervise({
  command: process.execPath,
  args: [fileURLToPath(new URL('./watch-inventory.mjs', import.meta.url))],
  signal: controller.signal,
  onRestart: ({ delayMs, cause }) =>
    console.error(
      `Collector stopped (${cause}). Restarting in ${delayMs / 1000} seconds; pending evidence stays on disk.`,
    ),
});
if (result.reason === 'restart_limit') {
  console.error(
    'Collector repeatedly failed to start or stay running. Automatic retries stopped. Check the error above, then restart after correcting it.',
  );
  process.exitCode = 1;
}
