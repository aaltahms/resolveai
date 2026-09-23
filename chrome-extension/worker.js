import {
  TARGET,
  safeRequest,
  collectorReport,
  relevantRequests,
} from './report.js';
let chain = Promise.resolve();
function serial(task) {
  const next = chain.then(task);
  chain = next.catch(() => {});
  return next;
}
const read = async () => (await chrome.storage.session.get('capture')).capture;
const save = (capture) => chrome.storage.session.set({ capture });
const filter = {
  urls: ['http://127.0.0.1/*'],
  types: ['main_frame', 'xmlhttprequest'],
};
chrome.webRequest.onBeforeRequest.addListener((d) => {
  const row = safeRequest(d, d.timeStamp);
  if (!row) return;
  void serial(async () => {
    const c = await read();
    if (
      !c?.active ||
      c.tabId !== d.tabId ||
      Date.now() > c.until ||
      c.rows.length >= 40 ||
      Object.keys(c.pending).length >= 60
    )
      return;
    c.pending[d.requestId] = { started: d.timeStamp };
    await save(c);
  });
}, filter);
function finish(d) {
  const sanitized = safeRequest(d, d.timeStamp);
  if (!sanitized) return;
  void serial(async () => {
    const c = await read();
    if (!c?.active || c.tabId !== d.tabId || Date.now() > c.until) return;
    const p = c.pending[d.requestId];
    if (!p) return;
    delete c.pending[d.requestId];
    if (c.rows.length < 40) c.rows.push(safeRequest(d, p.started));
    if (c.rows.length >= 40) {
      c.active = false;
      c.pending = {};
    }
    await save(c);
  });
}
chrome.webRequest.onCompleted.addListener(finish, filter);
chrome.webRequest.onErrorOccurred.addListener(finish, filter);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'capture-end')
    void serial(async () => {
      const c = await read();
      if (c) {
        c.active = false;
        c.pending = {};
        await save(c);
      }
    });
});
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  serial(async () => {
    const extensionPage =
      sender.id === chrome.runtime.id &&
      sender.url === chrome.runtime.getURL('popup.html');
    if (m.type === 'deliver-report') {
      const c = await read();
      const u = new URL(sender.url || 'about:blank');
      if (
        sender.id !== chrome.runtime.id ||
        u.origin !== 'http://127.0.0.1:3000' ||
        u.pathname !== '/' ||
        !c?.approved ||
        c.id !== m.id
      )
        throw Error('Report access denied.');
      return { report: collectorReport(c) };
    }
    if (!extensionPage)
      throw Error('Open the extension popup to control capture.');
    if (m.type === 'start') {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.url || new URL(tab.url).origin !== TARGET)
        throw Error(
          'Open http://127.0.0.1:4318 in Chrome first. This version captures only that test website.',
        );
      await save({
        id: crypto.randomUUID(),
        tabId: tab.id,
        until: Date.now() + 60000,
        active: true,
        approved: false,
        rows: [],
        pending: {},
      });
      await chrome.alarms.create('capture-end', { when: Date.now() + 60000 });
    }
    if (m.type === 'stop') {
      const c = await read();
      if (c) {
        c.active = false;
        c.pending = {};
        await save(c);
      }
    }
    if (m.type === 'clear') {
      await chrome.storage.session.remove('capture');
      await chrome.alarms.clear('capture-end');
    }
    if (m.type === 'send') {
      const c = await read();
      if (!c || c.active || !c.rows.length)
        throw Error('Stop capture and review the report first.');
      if (!relevantRequests(c).length)
        throw Error(
          'Only background checks were captured. Start again and click Save request on the test page within one minute.',
        );
      c.approved = true;
      await save(c);
      await chrome.tabs.create({
        url:
          'http://127.0.0.1:3000/signin-with-chatgpt?return_to=' +
          encodeURIComponent('/?chromeCapture=' + c.id),
      });
    }
    const c = await read();
    if (c && Date.now() > c.until) {
      c.active = false;
      c.pending = {};
      await save(c);
    }
    return { capture: c ? { ...c, pending: undefined } : null };
  }).then(reply, (e) => reply({ error: e.message }));
  return true;
});
