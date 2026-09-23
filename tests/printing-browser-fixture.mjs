// Isolated UI fixture: never contacts CUPS or a physical printer. Not imported by the app.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { renderShell } from '../local-lab/shell.mjs';
import { interpretPrinting } from '../local-lab/printing.mjs';
const origin = 'http://127.0.0.1:4322';
const ok = (text) => ({ ok: true, text });
const fixture = {
  service: ok('scheduler is running'),
  printers: ok(
    'printer Demo_Office is idle. enabled since yesterday\nprinter Demo_Lab disabled since yesterday\n',
  ),
  default: ok('system default destination: Demo_Office'),
  jobs: ok('Demo_Lab-1 test 100 today\n'),
};
const server = http.createServer((req, res) => {
  if (req.headers.host !== '127.0.0.1:4322') return res.writeHead(403).end();
  if (
    req.method === 'POST' &&
    req.headers.origin === origin &&
    [
      '/mac/printer-missing',
      '/mac/print-queue',
      '/mac/printer-default',
    ].includes(req.url)
  ) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify(interpretPrinting(req.url.split('/').at(-1), fixture)),
    );
  }
  const files = {
    '/': 'network.html',
    '/shell.css': 'shell.css',
    '/diagnostics-ui.js': 'diagnostics-ui.js',
  };
  if (req.method !== 'GET' || !Object.hasOwn(files, req.url))
    return res.writeHead(404).end();
  let body = readFileSync(
    new URL('../local-lab/' + files[req.url], import.meta.url),
    'utf8',
  );
  if (req.url === '/')
    body = renderShell(body, 'checks').replace(
      '<div class="page-intro">',
      '<div class="page-intro"><p role="note"><strong>TEST FIXTURE — simulated printer readings. Not observations of this Mac.</strong></p>',
    );
  res.setHeader(
    'Content-Type',
    req.url.endsWith('.css')
      ? 'text/css'
      : req.url.endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
  );
  res.end(body);
});
server.listen(4322, '127.0.0.1', () =>
  console.log('Printer UI fixture: ' + origin),
);
server.on('error', (error) => {
  console.error(error.code);
  process.exit(1);
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
