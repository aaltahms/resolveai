const root = document.getElementById('repair-plan'),
  message = document.getElementById('repair-message'),
  error = document.getElementById('repair-error'),
  diagnose = document.getElementById('diagnose-repair'),
  health = document.getElementById('health');
let pending = false,
  current,
  rendered = '',
  historyKey = '';
const explanations = {
  'enable-writes': {
    title: 'The app is blocking saves',
    fix: 'Allow this sample app to save data again. Existing notes will stay in place.',
  },
  'release-owned-lock': {
    title: 'A test operation is blocking the database',
    fix: 'Release the blocking test operation so the app can save again. Existing notes will stay in place.',
  },
  'start-service': {
    title: 'The saving app has stopped',
    fix: 'Start the sample app again. Its saved notes will stay in place.',
  },
};
function text(tag, value) {
  const e = document.createElement(tag);
  e.textContent = value;
  return e;
}
function progress(step) {
  for (const id of ['check', 'review', 'result']) {
    const e = document.getElementById('step-' + id);
    if (id === step) e.setAttribute('aria-current', 'step');
    else e.removeAttribute('aria-current');
  }
}
function download(plan) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resolveai-repair-' + plan.id + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function details(plan) {
  const box = document.createElement('details');
  box.append(
    text('summary', 'Why this fix?'),
    text('p', plan.diagnosis.description),
    text('p', plan.impact),
  );
  if (plan.verification.length)
    box.append(text('pre', plan.verification.map((v) => v.detail).join('\n')));
  const save = text('button', 'Download details');
  save.onclick = () => download(plan);
  box.append(save);
  return box;
}
function render() {
  const expired =
    current?.status === 'planned' && current.expiresAt < Date.now();
  const key = JSON.stringify(current) + expired;
  if (key === rendered) return;
  rendered = key;
  root.replaceChildren();
  if (!current) return;
  const plain = explanations[current.action];
  if (current.status === 'planned' && !expired) {
    root.append(
      text('h2', plain?.title || current.title),
      text('p', plain?.fix || current.impact),
    );
    const approve = text('button', 'Apply this fix');
    approve.className = 'primary';
    approve.onclick = () => void request('/repair/approve', { id: current.id });
    root.append(
      approve,
      text(
        'p',
        'This changes only the sample app. ResolveAI will check that saving works afterward.',
      ),
      details(current),
    );
  } else if (current.status === 'verified') {
    root.append(
      text(
        'p',
        'The fix passed three save-and-read checks. Try your own note to finish.',
      ),
    );
    const retry = text('button', 'Try saving a note');
    retry.className = 'primary';
    retry.onclick = () => {
      document.getElementById('try-save').open = true;
      document.getElementById('request-title').focus();
    };
    root.append(retry, details(current));
  } else if (current.status === 'applying')
    root.append(text('p', 'Applying the fix and testing saving…'));
  else if (current.status === 'expired' || expired)
    root.append(
      text(
        'p',
        'This suggestion is out of date. Check the problem again before making a change.',
      ),
    );
  else
    root.append(
      text(
        'p',
        'The fix was not confirmed. Check again or review the details before taking another action.',
      ),
      details(current),
    );
}
function update(d) {
  if (pending) return;
  if (current) current = d.repairs.find((p) => p.id === current.id) || current;
  if (
    current?.status === 'verified' &&
    d.state.down &&
    !d.samples[0]?.ok &&
    Date.parse(d.samples[0]?.at) > current.completedAt
  )
    current = undefined;
  if (current?.status === 'planned' && !d.state.down && !d.state.failures)
    current = undefined;
  const expired =
      current?.status === 'planned' && current.expiresAt < Date.now(),
    ready = current?.status === 'planned' && !expired;
  health.textContent = d.repairBusy
    ? 'Applying the fix…'
    : ready
      ? 'A fix is ready to review'
      : d.state.down
        ? 'Saving isn’t working'
        : d.state.failures
          ? 'Checking a possible problem…'
          : !d.samples.length
            ? 'Connecting to the sample app…'
            : current?.status === 'verified'
              ? 'Saving works again'
              : 'Saving is working';
  message.textContent = d.repairBusy
    ? 'Please wait while the result is checked.'
    : ready
      ? 'Review the change below. Nothing has been changed yet.'
      : d.state.down
        ? 'We found a saving problem. Check it to see whether a supported fix is available.'
        : d.state.failures
          ? 'A check failed. We’re confirming whether it repeats.'
          : !d.samples.length
            ? 'This usually takes a few seconds.'
            : 'No fix is needed right now.';
  diagnose.hidden =
    ready || d.repairBusy || (!d.state.down && !d.state.failures);
  diagnose.disabled = !d.state.down || d.repairBusy;
  if (current?.status === 'verified' && !d.repairBusy) {
    health.textContent = 'Saving works again';
    message.textContent =
      'The repair was checked successfully. You can try your own note below.';
    diagnose.hidden = true;
  }
  diagnose.textContent = current ? 'Check again' : 'Check the problem';
  progress(
    ready ? 'review' : current?.status === 'verified' ? 'result' : 'check',
  );
  render();
  const hkey = JSON.stringify(d.repairs);
  if (historyKey !== hkey) {
    historyKey = hkey;
    const history = document.getElementById('repair-history-list');
    history.replaceChildren();
    for (const plan of d.repairs) {
      const item = document.createElement('details');
      const status =
        {
          verified: 'Fix verified',
          planned: 'Suggestion',
          expired: 'Expired suggestion',
          failed: 'Fix not verified',
          interrupted: 'Interrupted',
          applying: 'In progress',
        }[plan.status] || plan.status;
      item.append(
        text(
          'summary',
          status + ' · ' + new Date(plan.createdAt).toLocaleString(),
        ),
        text('p', explanations[plan.action]?.title || plan.title),
        details(plan),
      );
      history.append(item);
    }
  }
}
async function request(path, body) {
  if (pending) return;
  pending = true;
  error.textContent = '';
  diagnose.disabled = true;
  root.querySelectorAll('button').forEach((b) => (b.disabled = true));
  health.textContent = body ? 'Applying the fix…' : 'Checking the problem…';
  message.textContent = body
    ? 'We’ll test saving after the change.'
    : 'Reviewing the latest checks. Nothing is being changed.';
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const p = await r.json();
    if (!r.ok) throw Error(p.error);
    current = p;
    rendered = '';
  } catch (e) {
    error.textContent = e.message;
  } finally {
    pending = false;
    rendered = '';
    render();
    window.dispatchEvent(new Event('resolveai-refresh'));
  }
}
diagnose.onclick = () => void request('/repair/plan');
window.addEventListener('resolveai-state', (e) => update(e.detail));
window.addEventListener('resolveai-offline', () => {
  health.textContent = 'The sample app is disconnected';
  message.textContent =
    'Reopen Start Local Lab.command on your Mac, then refresh this page.';
  diagnose.hidden = true;
  root.replaceChildren();
  rendered = '';
});
