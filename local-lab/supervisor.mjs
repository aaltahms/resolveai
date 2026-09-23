import { spawn } from 'node:child_process';
export async function supervise({
  command,
  args,
  signal,
  onRestart = () => {},
  maxFailures = 5,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
  stableMs = 60000,
  stopGraceMs = 5000,
  stdio = 'inherit',
}) {
  let failures = 0;
  while (!signal.aborted) {
    const started = Date.now();
    const outcome = await new Promise((resolve) => {
      const child = spawn(command, args, { stdio });
      let timeout,
        settled = false;
      const stop = () => {
        child.kill('SIGTERM');
        timeout = setTimeout(() => child.kill('SIGKILL'), stopGraceMs);
      };
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', stop);
        resolve(result);
      };
      child.once('error', (e) =>
        finish({ code: 1, reason: e.code || 'spawn failed' }),
      );
      child.once('exit', (code, killedBy) =>
        finish({ code, reason: killedBy || `exit ${code}` }),
      );
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
    });
    if (signal.aborted) return { reason: 'stopped', failures };
    if (outcome.code === 0) return { reason: 'completed', failures };
    if (Date.now() - started >= stableMs) failures = 0;
    failures++;
    if (failures >= maxFailures)
      return { reason: 'restart_limit', failures, lastFailure: outcome.reason };
    const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (failures - 1));
    onRestart({ failures, delayMs, cause: outcome.reason });
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      signal.addEventListener('abort', finish, { once: true });
      const timer = setTimeout(finish, delayMs);
      if (signal.aborted) finish();
    });
  }
  return { reason: 'stopped', failures };
}
