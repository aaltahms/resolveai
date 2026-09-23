import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const directory = new URL('./data/', import.meta.url);
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(
  fileURLToPath(new URL('records.sqlite', directory)),
);
db.exec(
  'CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL)',
);
const competingWriter = new DatabaseSync(
  fileURLToPath(new URL('records.sqlite', directory)),
);
let locked = false;
let delay = 0;
// Fault controls arrive over the parent-owned IPC channel, never from public HTTP input.
process.on('message', (m) => {
  if (m && typeof m === 'object' && m.type === 'control') {
    let error;
    if (m.action === 'enable-writes') db.exec('PRAGMA query_only = OFF');
    else if (m.action === 'release-owned-lock' && locked) {
      competingWriter.exec('ROLLBACK');
      locked = false;
    } else if (m.action !== 'inspect')
      error = 'Unsupported action or the owned lock is no longer present.';
    if (process.connected)
      process.send({
        type: 'control-result',
        id: m.id,
        error,
        state: {
          queryOnly: db.prepare('PRAGMA query_only').get().query_only === 1,
          locked,
          delay,
        },
      });
    return;
  }
  if (m === 'readonly') db.exec('PRAGMA query_only = ON');
  if (m === 'slow') delay = 1800;
  if (m === 'lock' && !locked) {
    competingWriter.exec('BEGIN IMMEDIATE');
    locked = true;
  }
  if (m === 'restore') {
    if (locked) {
      competingWriter.exec('ROLLBACK');
      locked = false;
    }
    db.exec('PRAGMA query_only = OFF');
    delay = 0;
  }
});
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health')
    return json(res, 200, { service: 'resolveai-demo', status: 'healthy' });
  if (req.method === 'GET' && req.url === '/records')
    return json(res, 200, {
      count: db.prepare('SELECT count(*) AS n FROM records').get().n,
      submitted: db
        .prepare(
          "SELECT * FROM records WHERE value LIKE 'User request: %' ORDER BY at DESC LIMIT 10",
        )
        .all(),
      recent: db
        .prepare('SELECT * FROM records ORDER BY at DESC LIMIT 5')
        .all(),
    });
  if (req.method === 'POST' && req.url === '/records') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1024)
        return json(res, 413, { error: 'INPUT_TOO_LARGE' });
    }
    let value;
    try {
      value = JSON.parse(body);
    } catch {
      return json(res, 400, { error: 'INVALID_JSON' });
    }
    if (
      typeof value?.id !== 'string' ||
      value.id.length > 80 ||
      typeof value.value !== 'string' ||
      value.value.length > 140
    )
      return json(res, 400, { error: 'INVALID_RECORD' });
    const started = performance.now();
    const trace = (stage, status, extra = {}) => {
      if (process.connected)
        process.send({
          type: 'trace',
          requestId: value.id,
          stage,
          status,
          elapsedMs: Math.round(performance.now() - started),
          ...extra,
        });
    };
    trace('application', 'started');
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (res.destroyed) {
      trace('application', 'client_disconnected');
      return;
    }
    trace('application', 'completed');
    trace('database_write', 'started');
    try {
      db.prepare('INSERT INTO records(id,value,at) VALUES(?,?,?)').run(
        value.id,
        value.value,
        new Date().toISOString(),
      );
      trace('database_write', 'completed');
      trace('database_read', 'started');
      const saved = db
        .prepare('SELECT * FROM records WHERE id=?')
        .get(value.id);
      trace('database_read', 'completed');
      // Only rotate machine-generated probes. User requests must not age out
      // merely because the monitor runs every two seconds.
      db.exec(
        "DELETE FROM records WHERE id IN (SELECT id FROM records WHERE value NOT LIKE 'User request: %' ORDER BY at DESC LIMIT -1 OFFSET 1000)",
      );
      return json(res, 201, { record: saved });
    } catch (e) {
      trace('database', 'failed', {
        error: e.errstr || e.code || 'WRITE_FAILED',
        queryOnly: db.prepare('PRAGMA query_only').get().query_only === 1,
      });
      return json(res, 503, {
        error: e.errstr || e.code || 'WRITE_FAILED',
        message: e.message,
      });
    }
  }
  json(res, 404, { error: 'NOT_FOUND' });
});
server.listen(4319, '127.0.0.1');
process.on('SIGTERM', () => {
  server.closeAllConnections();
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
