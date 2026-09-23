const choices = {
  'external-drive': [
    'My external drive isn’t appearing',
    'Checks external disk and volume metadata reported by macOS.',
    'Check external drives',
    'No disks are mounted, repaired, erased, or ejected. Disk images are excluded.',
  ],
  'drive-write': [
    'I can’t save to my external drive',
    'Reads volume write flags and available space when macOS supplies them.',
    'Check drive write status',
    'Does not write a test file or change permissions. A writable flag does not guarantee your app can save.',
  ],
  'printer-missing': [
    'I can’t find my printer',
    'Checks printers configured on this Mac and whether the local printing service responds.',
    'Check configured printers',
    'No network discovery or printer setup is performed. Only local printer names and queue states are returned.',
  ],
  'print-queue': [
    'My print queue isn’t moving',
    'Checks local queue states and counts unfinished jobs without reading document contents.',
    'Check print queues',
    'Nothing is printed, cancelled, paused, or resumed. A pending job does not prove a stuck queue.',
  ],
  'printer-default': [
    'It’s using the wrong printer',
    'Reads the default printer reported to the local checker so you can compare it with your Print dialog.',
    'Check default printer',
    'An app’s chosen printer or macOS Last Printer Used may differ. The check does not change your selection.',
  ],
  battery: [
    'My battery isn’t charging',
    'Reads the current power source, battery level, and charging status.',
    'Check charging',
    'Does not measure battery health, charger wattage, or temperature. No power settings are changed.',
  ],
  audio: [
    'I can’t hear any sound',
    'Lists sound output devices and checks which one macOS reports as the default.',
    'Check sound output',
    'May take up to 8 seconds. Does not play sound, record audio, read volume or mute, or change your output.',
  ],
  displays: [
    'My external display isn’t appearing',
    'Checks which displays macOS lists and their reported connection status.',
    'Check displays',
    'May take up to 8 seconds. No screenshots are taken and no display settings are changed.',
  ],
  network: [
    'My internet isn’t working',
    'Checks a network address, website lookups, and two secure connections.',
    'Check my connection',
    'Contacts example.com and www.apple.com. A successful test cannot rule out trouble with another site or an intermittent connection.',
  ],
  performance: [
    'My Mac is slow',
    'Checks a short CPU sample, macOS memory pressure, and visible process activity.',
    'Check performance',
    'Takes about 1–4 seconds. A snapshot may miss brief or app-specific slowdowns.',
  ],
  storage: [
    'I’m low on storage',
    'Measures available space on the Mac’s Data volume.',
    'Check storage',
    'Does not scan filenames or inspect your documents. Other disks and app quotas are not checked.',
  ],
  apps: [
    'An app isn’t responding',
    'Checks visible processes so you can inspect the affected app’s activity.',
    'Check app activity',
    'Does not read window contents, probe app responsiveness, or quit anything. Helpers are grouped by app name; apps outside the visible process list may be missing.',
  ],
};
let kind = 'network',
  previous,
  selectedApp,
  selectedPrinter;
const button = document.querySelector('#check'),
  result = document.querySelector('#result');
function add(tag, text, parent = result) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}
function selectKind(next) {
  kind = next;
  previous = undefined;
  selectedApp = undefined;
  selectedPrinter = undefined;
  result.replaceChildren();
  document.querySelector('#problem').textContent = choices[kind][0];
  document.querySelector('#description').textContent = choices[kind][1];
  button.textContent = choices[kind][2];
  document.querySelector('#scope').textContent = choices[kind][3];
  for (const item of document.querySelectorAll('[data-kind]'))
    item.setAttribute('aria-pressed', String(item.dataset.kind === kind));
}
for (const item of document.querySelectorAll('[data-kind]'))
  item.addEventListener('click', () => {
    selectKind(item.dataset.kind);
    if (window.matchMedia('(max-width:850px)').matches)
      document.querySelector('#problem').focus();
  });
selectKind(kind);
button.addEventListener('click', async () => {
  const current = kind;
  button.disabled = true;
  for (const item of document.querySelectorAll('[data-kind]'))
    item.disabled = true;
  button.textContent = 'Checking…';
  result.replaceChildren();
  add('p', 'Reading this Mac. Checks usually finish within a few seconds.');
  try {
    const response = await fetch(
      current === 'network' ? '/network/check' : `/mac/${current}`,
      { method: 'POST', signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) throw Error();
    const data = await response.json();
    result.replaceChildren();
    add('h2', data.title);
    add('p', data.explanation);
    if (previous)
      add(
        'small',
        `Previous check (${new Date(previous.checkedAt).toLocaleTimeString()}): ${previous.title}. Compare this new snapshot and retry the action that was failing; a reading alone does not confirm the problem is fixed.`,
      );
    if (current === 'apps' && data.processes?.length) {
      const apps = [
        ...data.processes
          .filter((p) => p.app)
          .reduce((map, p) => {
            const item = map.get(p.name) || {
              name: p.name,
              cpu: 0,
              memory: 0,
              count: 0,
            };
            item.cpu += p.cpu;
            item.memory += p.memory;
            item.count++;
            map.set(p.name, item);
            return map;
          }, new Map())
          .values(),
      ];
      const label = add('label', 'Choose your app');
      label.htmlFor = 'app-choice';
      const select = add('select', '');
      select.id = 'app-choice';
      add('option', 'Select an app…', select).value = '';
      for (const process of apps.sort((a, b) => a.name.localeCompare(b.name))) {
        const option = add('option', process.name, select);
        option.value = process.name;
      }
      const detail = add(
        'p',
        'If your app is missing, check Activity Monitor. The list includes visible app bundles and may include system helpers.',
      );
      detail.setAttribute('aria-live', 'polite');
      const render = () => {
        selectedApp = select.value;
        const process = apps.find((p) => p.name === selectedApp);
        detail.textContent = process
          ? `${process.name} had ${process.count} visible process(es) at check time: ${process.cpu.toFixed(1)}% CPU and ${(process.memory / 1024 ** 2).toFixed(0)} MB combined resident memory. Shared memory may be counted more than once. CPU may exceed 100% across cores. Being visible does not mean its window is responding. Try its menu, then recheck after waiting.`
          : 'If your app is missing, it may have exited, restarted, or be outside the visible process list. Check Activity Monitor; absence here does not prove a crash.';
      };
      if (selectedApp) {
        select.value = selectedApp;
        render();
      }
      select.addEventListener('change', render);
    }
    if (current === 'print-queue' && data.printers?.length) {
      const label = add('label', 'Choose the affected printer');
      label.htmlFor = 'printer-choice';
      const select = add('select', '');
      select.id = 'printer-choice';
      add('option', 'Select a printer…', select).value = '';
      for (const printer of data.printers)
        add('option', printer.name, select).value = printer.name;
      const detail = add('div', '');
      detail.setAttribute('aria-live', 'polite');
      const render = () => {
        selectedPrinter = select.value;
        detail.replaceChildren();
        const printer = data.printers.find((p) => p.name === selectedPrinter);
        if (printer) {
          add('h3', printer.finding.title, detail);
          add('p', printer.finding.explanation, detail);
          add('p', printer.finding.next, detail);
        } else
          add(
            'p',
            'This printer was not selected or is no longer in the visible list. Compare Printers & Scanners; a missing entry does not prove a printer failure.',
            detail,
          );
      };
      if (selectedPrinter) {
        select.value = selectedPrinter;
        render();
      }
      select.addEventListener('change', render);
    } else if (data.printers?.length) {
      add('h3', 'Printers configured on this Mac');
      const list = add('ul', '');
      for (const printer of data.printers) add('li', printer.name, list);
    }
    if (data.volumes?.length) {
      add('h3', 'External volume readings');
      const volumes = add('ul', '');
      for (const volume of data.volumes)
        add('li', `${volume.name}: ${volume.state}; ${volume.space}.`, volumes);
    }
    add('h3', 'What to do next');
    add('p', data.next);
    const details = add('details', '');
    add('summary', 'Evidence and limitations', details);
    const list = add('ul', '', details);
    if (current === 'network') {
      add(
        'li',
        data.connected === null
          ? 'Network address check unavailable: macOS or the launch environment blocked access. Open System Settings → Network to inspect the connection.'
          : data.connected
            ? 'External network address found; this does not prove the router has internet access.'
            : 'No external network address found.',
        list,
      );
      for (const item of data.dns)
        add(
          'li',
          `IPv4 DNS lookup (${item.host}): ${item.ok ? 'worked' : 'failed'}`,
          list,
        );
      for (const item of data.sites)
        add('li', `HTTPS (${item.host}): ${item.detail}`, list);
      add(
        'li',
        'DNS uses a direct IPv4 lookup; HTTPS uses the OS resolver. VPN, proxy, captive portal, IPv6-only, and browser behavior can differ.',
        list,
      );
    } else for (const item of data.evidence) add('li', item, list);
    if (current === 'performance' && data.processes?.length) {
      add('p', 'Highest visible process activity (OS estimates):', details);
      const processes = add('ul', '', details);
      for (const p of data.processes.slice(0, 5))
        add(
          'li',
          `${p.name}: ${p.cpu.toFixed(1)}% CPU, ${(p.memory / 1024 ** 2).toFixed(0)} MB resident memory.`,
          processes,
        );
    }
    add(
      'small',
      `Checked ${new Date(data.checkedAt).toLocaleTimeString()}. Snapshot only; rechecking does not apply a fix.`,
    );
    previous = data;
  } catch {
    result.replaceChildren();
    add('h2', 'The checks could not finish');
    add(
      'p',
      'The local service may have stopped or the request timed out. Try again. If it still fails, run the startup command in the README and reopen http://127.0.0.1:4318/.',
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Check again';
    for (const item of document.querySelectorAll('[data-kind]'))
      item.disabled = false;
  }
});

const search = document.querySelector('#case-search');
search.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  let count = 0;
  for (const item of document.querySelectorAll('[data-kind]')) {
    const matches = `${item.textContent} ${item.dataset.keywords || ''}`
      .toLowerCase()
      .includes(query);
    item.hidden = !matches;
    if (matches) count++;
  }
  for (const group of document.querySelectorAll('.choice-group'))
    group.hidden = ![...group.querySelectorAll('[data-kind]')].some(
      (item) => !item.hidden,
    );
  document.querySelector('#case-count').textContent =
    `${count} live ${count === 1 ? 'check' : 'checks'} ${query ? 'found' : 'available'}`;
  document.querySelector('#no-cases').hidden = count !== 0;
});
