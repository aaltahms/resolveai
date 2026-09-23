import { relevantRequests } from './report.js';
async function update(type = 'status') {
  try {
    const d = await chrome.runtime.sendMessage({ type });
    if (d.error) throw Error(d.error);
    const c = d.capture;
    const rows = c ? relevantRequests(c) : [];
    document.getElementById('status').textContent = c?.active
      ? `Capturing · ${rows.length} relevant requests · ${Math.max(0, Math.ceil((c.until - Date.now()) / 1000))} seconds left. Close this popup and click Save request on the test page, then reopen it.`
      : c
        ? rows.length
          ? 'Capture stopped. Review the evidence below.'
          : 'Your action was not captured. Start again, close this popup, and click Save request within one minute.'
        : 'Open 127.0.0.1:4318 in this tab, then click Start capture.';
    document.getElementById('report').textContent = rows.length
      ? rows
          .map(
            (r) =>
              `${r.method} ${r.path} · ${r.status ? 'HTTP ' + r.status : 'Network error'} · ${r.durationMs} ms`,
          )
          .join('\n')
      : 'No relevant requests yet. Successful background checks are hidden.';
    document.getElementById('start').disabled = !!c?.active;
    document.getElementById('stop').disabled = !c?.active;
    document.getElementById('send').disabled = !c || c.active || !rows.length;
    if (type !== 'status') document.getElementById('error').textContent = '';
  } catch (e) {
    document.getElementById('error').textContent = e.message;
  }
}
for (const type of ['start', 'stop', 'send', 'clear'])
  document.getElementById(type).onclick = () => update(type);
void update();

// Refresh the visible count while the popup remains open.
setInterval(() => {
  void update();
}, 1000);
