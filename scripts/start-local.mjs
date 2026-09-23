import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1000);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${fileURLToPath(new URL('.', `file://${process.execPath}`))}:${process.env.PATH || ''}`,
    },
  });
  children.add(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(
        `A required service exited (${code}). Restart this launcher after reviewing its output.`,
      );
      stop(1);
    }
  });
  return child;
}
async function status(port, signature) {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return (await response.text()).includes(signature) ? 'ready' : 'occupied';
  } catch (error) {
    return error.cause?.code === 'ECONNREFUSED' ? 'offline' : 'occupied';
  }
}
async function ready(port, signature) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await status(port, signature)) === 'ready') return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error(
    `Service on port ${String(port)} did not become ready. Review the error above.`,
  );
}
try {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw Error('Install Node.js 22.13 or newer.');
  for (const binary of ['vinext', 'wrangler'])
    if (!existsSync(`node_modules/${binary}`))
      throw Error('Dependencies missing. Run pnpm install first.');
  for (const [port, signature, args] of [
    [
      3000,
      'ResolveAI',
      ['node_modules/vinext/dist/cli.js', 'dev', '--hostname', '127.0.0.1'],
    ],
    [4318, 'Mac troubleshooting', ['local-lab/run.mjs']],
  ]) {
    const current = await status(port, signature);
    if (current === 'occupied')
      throw Error(
        `Port ${String(port)} is occupied or unresponsive. No existing process was stopped.`,
      );
    if (current === 'ready')
      console.log(
        `Reusing ResolveAI on ${String(port)}; this launcher will not stop it.`,
      );
    else {
      if (port === 3000) {
        const migration = spawn(
          process.execPath,
          [
            'node_modules/wrangler/bin/wrangler.js',
            'd1',
            'migrations',
            'apply',
            'DB',
            '--local',
            '--config',
            'wrangler.local.json',
          ],
          { stdio: 'inherit' },
        );
        const code = await new Promise((resolve, reject) => {
          migration.on('exit', resolve);
          migration.on('error', reject);
        });
        if (code !== 0)
          throw Error('Database migration failed. Startup stopped.');
      }
      start(args);
      await ready(port, signature);
    }
  }
  console.log(
    '\nResolveAI is ready: http://resolveai.localhost:4318/\nFallback: http://127.0.0.1:4318/\nKeep this Terminal window open. Control-C stops only services started here.\nThis launcher does not install a login service or survive a restart.',
  );
  setInterval(() => {}, 60000);
} catch (error) {
  console.error(error.message);
  stop(1);
}
