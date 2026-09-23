// Exact loopback names only. An alias must never broaden access to other origins.
const hosts = new Set(['127.0.0.1:4318', 'resolveai.localhost:4318']);
export function allowedHost(host) {
  return hosts.has(host);
}
export function sameOrigin(headers) {
  return (
    allowedHost(headers.host) && headers.origin === `http://${headers.host}`
  );
}
