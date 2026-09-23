void (async () => {
  if (location.origin !== 'http://127.0.0.1:3000' || location.pathname !== '/')
    return;
  const id = new URLSearchParams(location.search).get('chromeCapture');
  if (!id) return;
  const notice = document.createElement('p');
  notice.setAttribute('role', 'status');
  notice.style.cssText =
    'position:fixed;bottom:20px;left:20px;right:20px;background:#10233e;color:white;padding:20px;z-index:2147483647';
  notice.textContent = 'Saving the Chrome report you approved…';
  document.body.append(notice);
  try {
    const d = await chrome.runtime.sendMessage({ type: 'deliver-report', id });
    if (d.error) throw Error(d.error);
    const response = await fetch('/api/collector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d.report),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Save failed');
    location.replace('/?incident=' + encodeURIComponent(result.ticket.id));
  } catch (e) {
    notice.textContent =
      'Chrome report was not confirmed: ' +
      e.message +
      ' Reopen ResolveAI Capture and choose Send again. Repeating the same report will not duplicate the incident.';
  }
})();
