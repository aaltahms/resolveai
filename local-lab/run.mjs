import http from 'node:http';
import { renderShell } from './shell.mjs';
import { allowedHost, sameOrigin } from './local-access.mjs';
import { checkMac } from './mac-checks.mjs';
import { checkNetwork } from './network.mjs';
import { incidentBrief } from './brief.mjs';
import { submitRequest } from './submit.mjs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { observe } from './monitor.mjs';
import { mkdirSync } from 'node:fs';
import { repairController, verifyOwnedService } from './repair.mjs';
const origin = 'http://resolveai.localhost:4318';
const app = 'http://127.0.0.1:3000';
let child,
  stopping = false,
  sampling = false,
  cookie,
  incident,
  syncError = '';
const pending = [];
const traces = new Map();
const controls = new Map();
let revision = 0;
async function control(action) {
  if (!child?.connected) throw Error('The owned service is not connected.');
  const owned = child,
    id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      controls.delete(id);
      reject(Error('Service control timed out.'));
    }, 1500);
    controls.set(id, (message) => {
      clearTimeout(timeout);
      controls.delete(id);
      if (message.error) reject(Error(message.error));
      else resolve(message.state);
    });
    owned.send({ type: 'control', action, id }, (error) => {
      if (error) {
        clearTimeout(timeout);
        controls.delete(id);
        reject(error);
      }
    });
  });
}
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
const repairs = repairController({
  path: fileURLToPath(new URL('./data/repairs.sqlite', import.meta.url)),
  samples: () => samples,
  inspect: async () =>
    child
      ? {
          revision,
          running: true,
          pid: child.pid,
          ...(await control('inspect')),
        }
      : { revision, running: false },
  execute: async (action) => {
    if (action === 'start-service') {
      start();
      let ready = false;
      for (let i = 0; i < 15; i++) {
        try {
          await control('inspect');
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (!ready) throw Error('The owned service did not become ready.');
    } else {
      revision++;
      await control(action);
    }
    record('Approved repair executed: ' + action);
  },
  verify: () => verifyOwnedService(),
});
let state = { failures: 0, successes: 0, down: false },
  samples = [],
  events = [];
function record(message) {
  events.unshift({ at: new Date().toISOString(), message });
  events = events.slice(0, 30);
}
function start() {
  if (child || stopping) return;
  revision++;
  child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./service.mjs', import.meta.url))],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  const owned = child;
  owned.on('message', (event) => {
    if (event?.type === 'control-result') {
      controls.get(event.id)?.(event);
      return;
    }
    if (event?.type !== 'trace') return;
    const entries = traces.get(event.requestId) || [];
    if (entries.length < 12) entries.push(event);
    traces.set(event.requestId, entries);
    if (traces.size > 100) traces.delete(traces.keys().next().value);
  });
  owned.stderr.resume();
  owned.on('exit', (code) => {
    if (code)
      record(
        'Service exited with an error. Check whether its port is already occupied.',
      );
    if (child === owned) {
      child = undefined;
      revision++;
    }
  });
  record('Started the local demo service.');
}
async function api(path, body, method = 'POST') {
  if (!cookie) {
    const login = await fetch(app + '/signin-with-chatgpt?return_to=/', {
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    });
    cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie)
      throw Error(
        'Open the local ResolveAI app and check that its development server is running.',
      );
  }
  const r = await fetch(app + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: app,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401) cookie = undefined;
    throw Error(d.error || 'Incident sync failed');
  }
  return d;
}
async function sync() {
  if (!pending.length) return;
  const next = pending[0];
  try {
    if (next.kind === 'outage') {
      incident = undefined;
      // Do not automatically retry an ambiguous create: it could duplicate an incident.
      pending.shift();
      const d = await api('/api/tickets', {
        title: next.brief.title,
        description: next.brief.description,
        source: 'reported',
        category: 'application',
        priority: 'P2',
        asset: 'resolveai-demo / 127.0.0.1:4319',
        evidence: next.evidence,
      });
      incident = d.ticket;
      record('ResolveAI incident created: ' + incident.id);
    } else {
      pending.shift();
      if (!incident)
        throw Error(
          'Recovery observed, but no incident was available to update.',
        );
      const d = await api('/api/tickets', undefined, 'GET');
      const current = d.tickets.find((t) => t.id === incident.id);
      if (!current) throw Error('The incident is unavailable.');
      if (current.status !== 'resolved')
        await api(
          '/api/tickets/' + incident.id + '/work',
          {
            operation: 'comment',
            revision: current.revision,
            text: next.evidence,
          },
          'PATCH',
        );
      record(
        'Recovery checked and recorded. Review the incident before resolving it.',
      );
    }
    syncError = '';
  } catch (e) {
    syncError = e.message;
    record(
      'Incident sync needs attention: ' +
        e.message +
        '. Evidence remains visible here.',
    );
  }
}
async function probe() {
  if (sampling || stopping || repairs.busy) return;
  sampling = true;
  const beganRevision = revision;
  try {
    const began = performance.now();
    let sample;
    let healthStatus;
    const id = crypto.randomUUID();
    try {
      const health = await fetch('http://127.0.0.1:4319/health', {
        signal: AbortSignal.timeout(1000),
      });
      healthStatus = health.status;
      const r = await fetch('http://127.0.0.1:4319/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value: 'ResolveAI functional probe' }),
        signal: AbortSignal.timeout(1000),
      });
      const data = await r.json();
      sample = {
        ok:
          health.ok &&
          r.status === 201 &&
          data.record?.id === id &&
          data.record?.value === 'ResolveAI functional probe',
        detail: `health HTTP ${health.status}; write/read-back HTTP ${r.status}${data.error ? '; ' + data.error : ''}${data.message ? '; ' + data.message : ''}`,
        latencyMs: Math.round(performance.now() - began),
      };
    } catch (e) {
      sample = {
        ok: false,
        detail: `${healthStatus ? 'health HTTP ' + healthStatus + '; write/read-back ' : 'health '}${e.cause?.code || e.name || 'Request failed'}`,
        latencyMs: Math.round(performance.now() - began),
      };
    }
    try {
      const r = await fetch('http://127.0.0.1:4319/records', {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) records = await r.json();
    } catch {}
    sample.requestId = id;
    sample.revision = beganRevision === revision ? revision : -1;
    sample.trace = [...(traces.get(id) || [])];
    sample.at = new Date().toISOString();
    samples.unshift(sample);
    samples = samples.slice(0, 30);
    const observation = observe(state, sample);
    state = observation.state;
    if (observation.event) {
      const evidence = samples
        .slice(0, 3)
        .reverse()
        .map(
          (s) =>
            `${s.at} request=${s.requestId} ${s.detail} ${s.latencyMs}ms\n${s.trace.map((t) => `  ${t.stage}: ${t.status} at +${t.elapsedMs}ms${t.error ? '; error=' + t.error : ''}${t.queryOnly !== undefined ? '; SQLite query_only=' + t.queryOnly : ''}`).join('\n')}`,
        )
        .join('\n');
      pending.push({
        kind: observation.event,
        brief: incidentBrief(samples),
        evidence:
          observation.event === 'recovery'
            ? 'Monitor observed three consecutive successful persisted record write/read-back checks after the outage:\n' +
              evidence
            : evidence,
      });
      record(
        observation.event === 'outage'
          ? 'Outage detected after three failed checks.'
          : 'Recovery verified after three healthy checks.',
      );
    }
    await sync();
  } finally {
    sampling = false;
  }
}
let records = { count: 0, recent: [] };
function latestEvaluation() {
  try {
    return JSON.parse(
      readFileSync(
        new URL('./data/latest-evaluation.json', import.meta.url),
        'utf8',
      ),
    );
  } catch {
    return null;
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!allowedHost(req.headers.host)) {
    res.writeHead(403).end();
    return;
  }
  const pages = {
    '/': ['network.html', 'checks'],
    '/guide': ['guide.html', 'guide'],
    '/lab': ['index.html', 'lab'],
    '/desk': ['desk.html', 'desk'],
  };
  if (req.method === 'GET' && pages[req.url]) {
    const [file, section] = pages[req.url];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      renderShell(
        readFileSync(new URL('./' + file, import.meta.url), 'utf8'),
        section,
      ),
    );
    return;
  }
  if (req.method === 'GET' && req.url === '/shell.css') {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.end(readFileSync(new URL('./shell.css', import.meta.url)));
    return;
  }
  if (
    req.method === 'GET' &&
    ['/repair-ui.js', '/page-ui.js', '/diagnostics-ui.js'].includes(req.url)
  ) {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.end(readFileSync(new URL('.' + req.url, import.meta.url)));
    return;
  }
  if (req.method === 'GET' && req.url === '/state') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        state,
        records,
        evaluation: latestEvaluation(),
        samples,
        events,
        incidentId: incident?.id,
        syncError,
        serviceRunning: !!child,
        repairBusy: repairs.busy,
        repairs: repairs.history(),
      }),
    );
    return;
  }
  if (req.method === 'POST' && sameOrigin(req.headers)) {
    if (
      [
        '/mac/external-drive',
        '/mac/drive-write',
        '/mac/printer-missing',
        '/mac/print-queue',
        '/mac/printer-default',
        '/mac/battery',
        '/mac/audio',
        '/mac/displays',
        '/mac/storage',
        '/mac/performance',
        '/mac/apps',
        '/network/check',
      ].includes(req.url)
    ) {
      try {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify(
            await (req.url === '/network/check'
              ? checkNetwork()
              : checkMac(req.url.split('/').at(-1))),
          ),
        );
      } catch {
        res.writeHead(503).end(
          JSON.stringify({
            error: 'The checks could not finish. Please try again.',
          }),
        );
      }
      return;
    }
    if (req.url === '/repair/plan' || req.url === '/repair/approve') {
      try {
        if (sampling)
          throw Object.assign(
            Error('A health check is finishing. Try again in a moment.'),
            { status: 409 },
          );
        let result;
        if (req.url === '/repair/plan') result = await repairs.plan();
        else {
          if (!req.headers['content-type']?.startsWith('application/json'))
            throw Object.assign(Error('Expected JSON.'), { status: 400 });
          let body = '';
          for await (const part of req) {
            body += part;
            if (body.length > 2000)
              throw Object.assign(Error('Request too large.'), { status: 413 });
          }
          const input = JSON.parse(body);
          if (
            !input ||
            Object.keys(input).length !== 1 ||
            typeof input.id !== 'string' ||
            !/^[a-f0-9-]{36}$/.test(input.id)
          )
            throw Object.assign(Error('Choose a valid repair plan.'), {
              status: 400,
            });
          result = await repairs.approve(input.id);
          record(result.message);
        }
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(result));
      } catch (e) {
        res
          .writeHead(e.status || 400, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (req.url === '/submit') {
      try {
        const result = await submitRequest(req);
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400).end();
      }
      return;
    }
    if (repairs.busy) {
      res.writeHead(409).end('A repair is running');
      return;
    }
    if (req.url === '/stop') {
      if (repairs.busy) {
        res.writeHead(409).end('A repair is running');
        return;
      }
      revision++;
      child?.kill('SIGTERM');
      record('Requested stop of the demo service.');
    } else if (req.url === '/start') start();
    else if (['/readonly', '/slow', '/lock', '/restore'].includes(req.url)) {
      if (repairs.busy) {
        res.writeHead(409).end('A repair is running');
        return;
      }
      if (!child?.connected) {
        res.writeHead(409).end('Start the service first');
        return;
      }
      revision++;
      child.send(req.url.slice(1));
      record('Controlled experiment: ' + req.url.slice(1));
    } else {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(204).end();
    return;
  }
  res.writeHead(403).end();
});
server.on('error', (e) => {
  console.error('Lab dashboard could not start:', e.code);
  process.exit(1);
});
server.listen(4318, '127.0.0.1', () => {
  start();
  console.log('ResolveAI local lab: ' + origin);
});
const timer = setInterval(probe, 2000);
function shutdown() {
  stopping = true;
  clearInterval(timer);
  child?.kill('SIGTERM');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
