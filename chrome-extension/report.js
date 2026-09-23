export const TARGET = 'http://127.0.0.1:4318';
export const relevantRequests = (capture) =>
  capture.rows.filter(
    (r) => !(r.method === 'GET' && r.path === '/state' && !r.failed),
  );
export function safeRequest(details, started) {
  let url;
  try {
    url = new URL(details.url);
  } catch {
    return null;
  }
  if (
    url.origin !== TARGET ||
    !['main_frame', 'xmlhttprequest'].includes(details.type)
  )
    return null;
  // Only known static routes are named. User-controlled paths, query strings and fragments are omitted.
  const path = [
    '/',
    '/submit',
    '/state',
    '/restore',
    '/readonly',
    '/slow',
    '/lock',
    '/stop',
    '/start',
  ].includes(url.pathname)
    ? url.pathname
    : '[path omitted]';
  return {
    method: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ].includes(details.method)
      ? details.method
      : 'OTHER',
    path,
    status: Number.isInteger(details.statusCode) ? details.statusCode : 0,
    durationMs: Math.max(0, Math.round(details.timeStamp - started)),
    failed: !!details.error || details.statusCode >= 400,
  };
}
export function collectorReport(capture) {
  const rows = relevantRequests(capture);
  const failures = rows.filter((r) => r.failed);
  return {
    episode: capture.id,
    phase: 'outage',
    channel: 'chrome',
    title: failures.length
      ? 'Chrome capture: a page request failed'
      : 'Chrome capture: no failed request observed',
    description: failures.length
      ? 'A user-triggered Chrome capture observed failed requests on the local test page. Review the statuses and timings below. Browser evidence alone does not establish the backend cause.'
      : 'No failed request was observed during this user-triggered capture. This does not prove the page or backend is healthy; the reported problem may require more evidence.',
    evidence: [
      'Source: Chrome user-triggered capture; local test page only.',
      'Only completed requests started during capture are included. Pending requests and other origins are omitted.',
      `${capture.rows.length - rows.length} successful background checks omitted.`,
      ...rows.map(
        (r) =>
          `${r.method} ${r.path} — ${r.status ? 'HTTP ' + r.status : 'network failure'} — ${r.durationMs} ms`,
      ),
    ].join('\n'),
  };
}
