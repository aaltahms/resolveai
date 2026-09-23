const byId = (id) => document.getElementById(id);
let sending = false;
function list(id, items) {
  byId(id).replaceChildren(
    ...items.map((value) => {
      const li = document.createElement('li');
      li.textContent = value;
      return li;
    }),
  );
}
async function refresh() {
  try {
    const r = await fetch('/state');
    if (!r.ok) throw Error();
    const d = await r.json();
    const submitted = d.records.submitted || [];
    list(
      'submitted',
      submitted.length
        ? submitted.map((r) => r.value.replace(/^User request: /, ''))
        : ['No saved notes yet.'],
    );
    for (const id of ['readonly', 'slow', 'lock', 'restore', 'stop'])
      byId(id).disabled = sending || d.repairBusy || !d.serviceRunning;
    byId('start').disabled = sending || d.repairBusy || d.serviceRunning;
    byId('record-count').textContent = d.records.count;
    byId('records').textContent = d.records.recent
      .map((r) => r.at + ' ' + r.id + ' ' + r.value)
      .join('\n');
    byId('samples').textContent = d.samples
      .map(
        (s) =>
          s.at +
          ' ' +
          (s.ok ? 'OK' : 'FAIL') +
          ' ' +
          s.detail +
          ' ' +
          s.latencyMs +
          ' ms',
      )
      .join('\n');
    byId('latest').textContent = d.samples[0]
      ? 'Last check: ' + d.samples[0].at
      : 'Waiting for a check';
    byId('incident').textContent = d.incidentId || '';
    byId('guidance').hidden = !d.incidentId && !d.syncError;
    byId('next').textContent = d.incidentId
      ? 'The observations are saved in the incident workspace.'
      : 'No incident has been saved yet.';
    byId('desk').hidden = !d.incidentId;
    byId('desk').href =
      'http://127.0.0.1:3000/signin-with-chatgpt?return_to=' +
      encodeURIComponent(d.incidentId ? '/?incident=' + d.incidentId : '/');
    byId('error').textContent = d.syncError;
    list(
      'events',
      d.events.map(
        (e) => new Date(e.at).toLocaleTimeString() + ' — ' + e.message,
      ),
    );
    byId('evaluation').textContent = d.evaluation
      ? JSON.stringify(d.evaluation, null, 2)
      : 'No evaluation recorded.';
    byId('bars').replaceChildren(
      ...[...d.samples].reverse().map((s) => {
        const bar = document.createElement('span');
        bar.className = s.ok ? 'ok' : 'fail';
        bar.title = s.detail;
        return bar;
      }),
    );
    window.dispatchEvent(new CustomEvent('resolveai-state', { detail: d }));
  } catch {
    for (const id of ['readonly', 'slow', 'lock', 'restore', 'stop', 'start'])
      byId(id).disabled = true;
    window.dispatchEvent(new CustomEvent('resolveai-offline'));
  }
}
for (const action of ['stop', 'start', 'readonly', 'slow', 'lock', 'restore'])
  byId(action).onclick = async () => {
    sending = true;
    try {
      const r = await fetch('/' + action, { method: 'POST' });
      if (!r.ok) throw Error('Could not change the test conditions.');
      byId('repair-error').textContent = '';
    } catch (e) {
      byId('repair-error').textContent = e.message;
    } finally {
      sending = false;
      await refresh();
    }
  };
byId('request-form').onsubmit = async (e) => {
  e.preventDefault();
  byId('submit-request').disabled = true;
  byId('request-result').textContent = 'Saving…';
  try {
    const r = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: byId('request-title').value }),
    });
    await r.json();
    byId('request-result').textContent = r.ok
      ? 'Saved. Your note was written and read back successfully.'
      : 'The note could not be saved. Use “Check the problem” above to see whether a fix is available.';
  } catch {
    byId('request-result').textContent =
      'The sample app could not be reached. Your note is still here.';
  } finally {
    byId('submit-request').disabled = false;
    await refresh();
  }
};
window.addEventListener('resolveai-refresh', () => void refresh());
void refresh();
setInterval(() => void refresh(), 2000);
