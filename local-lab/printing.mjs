// Fixed localhost CUPS observations only. Never return job names, owners, IDs,
// document paths, device URLs, or unfiltered scheduler error messages.
export function parsePrinterList(raw) {
  if (!raw.ok) return null;
  const lines = raw.text.split('\n').filter((line) => line.trim());
  if (!lines.length) return [];
  const items = [];
  for (const line of lines) {
    if (/^\s/.test(line)) continue; // Error details can contain private URLs or paths.
    const match = line.match(/^printer (\S+) (.*)$/);
    if (!match) return null;
    const status = /\bdisabled\b/.test(match[2])
      ? 'paused'
      : /\bis idle\b/.test(match[2])
        ? 'idle'
        : /\bnow printing\b/.test(match[2])
          ? 'printing'
          : 'unknown';
    items.push({ name: match[1].slice(0, 127), status });
  }
  return items.length ? items.slice(0, 50) : null;
}
export function parseDefault(raw) {
  if (!raw.ok) return { known: false, name: null };
  const text = raw.text.trim();
  if (text === 'no system default destination')
    return { known: true, name: null };
  const match = text.match(/^system default destination: (\S+)$/);
  return match
    ? { known: true, name: match[1].slice(0, 127) }
    : { known: false, name: null };
}
export function parseJobCounts(raw) {
  if (!raw.ok) return null;
  const counts = Object.create(null);
  for (const line of raw.text.split('\n').filter((line) => line.trim())) {
    const match = line.match(/^(\S+)-\d+\s/);
    if (!match) return null;
    const name = match[1].slice(0, 127);
    counts[name] = (Object.hasOwn(counts, name) ? counts[name] : 0) + 1;
  }
  return counts;
}
export function printerFinding(printer) {
  if (printer.status === 'paused')
    return {
      title: `${printer.name} is paused`,
      explanation:
        'The local queue is disabled for printing. This is not proof that the physical printer is faulty.',
      next: 'Open Print Center and inspect this queue’s message. If appropriate, resume the queue yourself. Check the printer’s power, paper, and connection, then recheck and verify the original document.',
    };
  if (printer.pending > 0)
    return {
      title: `${printer.name} has ${printer.pending} unfinished job(s)`,
      explanation:
        'The queue contains unfinished work. A snapshot cannot tell whether jobs are stuck, actively printing, held, or waiting for the printer.',
      next: 'Open this queue in Print Center and compare its status with the printer. Wait for an active job to finish. If your own job shows an error, inspect it before deciding whether to retry it. Do not cancel other people’s jobs. Recheck after waiting.',
    };
  if (printer.pending === null)
    return {
      title: `Job status for ${printer.name} is unavailable`,
      explanation:
        'The printer was listed, but unfinished jobs could not be read. Missing data does not mean the queue is empty.',
      next: 'Open this printer’s queue in Print Center. Read the status of your job and check again after the local service is accessible.',
    };
  return {
    title: `No unfinished jobs were listed for ${printer.name}`,
    explanation:
      'A completed or absent local job does not prove paper came out. Your document may have gone to another queue or never reached this one.',
    next: 'In the app’s Print dialog, confirm the intended printer. Inspect its queue and the physical output. If the document still does not print, try a small document yourself and observe the queue before rechecking.',
  };
}
export function interpretPrinting(kind, snapshot) {
  const printers = parsePrinterList(snapshot.printers),
    defaultPrinter = parseDefault(snapshot.default),
    counts = parseJobCounts(snapshot.jobs);
  const service =
    snapshot.service.ok &&
    snapshot.service.text.trim() === 'scheduler is running';
  const evidence = [
    service
      ? 'Local print scheduler responded.'
      : 'The local print scheduler could not be confirmed reachable. A stopped service, local access restriction, or unavailable CUPS endpoint can cause this.',
    defaultPrinter.known
      ? defaultPrinter.name
        ? `Default destination: ${defaultPrinter.name}.`
        : 'No system default destination was reported.'
      : 'Default printer reading unavailable.',
  ];
  const items = (printers || []).map((p) => ({
    ...p,
    pending:
      counts === null
        ? null
        : Object.hasOwn(counts, p.name)
          ? counts[p.name]
          : 0,
  }));
  for (const p of items)
    evidence.push(
      `${p.name}: ${p.status}; unfinished jobs: ${p.pending === null ? 'unavailable' : p.pending}.`,
    );
  if (printers === null)
    evidence.push('Configured printer list unavailable or not recognized.');
  else if (!printers.length)
    evidence.push('The configured printer list was empty.');
  if (counts === null) evidence.push('Job counts unavailable.');
  evidence.push(
    'Checks query only this Mac’s local printing service. No printer discovery, network reachability test, job submission, cancellation, queue resumption, or default-printer change. Job owners, titles, IDs, paths, and device URLs are not retained.',
  );
  let finding;
  if (
    kind !== 'printer-default' &&
    (printers === null || (!service && !items.length))
  )
    finding = {
      title: 'The local printing service could not be checked',
      explanation:
        'ResolveAI could not get a usable printer inventory from this Mac. This is not evidence that your physical printer is broken or missing.',
      next: 'Open System Settings → Printers & Scanners. If your printer appears there, open its queue in Print Center and read the message. If this is a managed Mac and the queue cannot open, contact your IT team with that message. Try these checks again afterward.',
    };
  else if (kind === 'printer-missing')
    finding = items.length
      ? {
          title: `${items.length} configured printer(s) found`,
          explanation:
            'These are printers configured on this Mac, not a discovery of every printer nearby. A listed printer may still be disconnected.',
          next: 'Look for your intended printer in the list below. If it is missing, check its power and connection, then open System Settings → Printers & Scanners. For a workplace printer, get the approved setup from IT. Recheck after you complete setup.',
        }
      : {
          title: 'No configured printers were listed',
          explanation:
            'The local service returned an empty printer list. Your printer may not be configured for this Mac; nearby printers were not searched.',
          next: 'Open System Settings → Printers & Scanners and compare its list. Confirm the printer is powered on and connected. Use your organization’s approved setup for workplace printers, then recheck.',
        };
  else if (kind === 'printer-default')
    finding = !defaultPrinter.known
      ? {
          title: 'The default printer could not be read',
          explanation:
            'Configured printers may be visible, but no recognized default-printer reading was returned.',
          next: 'Open the app’s Print dialog and check the selected printer yourself. Also review the Default printer setting in Printers & Scanners, then recheck.',
        }
      : defaultPrinter.name
        ? {
            title: `The reported default is ${defaultPrinter.name}`,
            explanation:
              'This is the default destination visible to the local checker. macOS “Last Printer Used”, an app’s own selection, or user-specific preferences can differ. ResolveAI cannot know which printer you intended.',
            next: 'Open the Print dialog in the app that sent the document. Compare its selection with the printer you intended and choose the correct one yourself before printing. Recheck if you change the default, and confirm where the document actually printed.',
          }
        : {
            title: 'No system default printer was reported',
            explanation:
              'An app can still select a printer itself, and macOS may use the last printer selected. No default does not prove printing will fail.',
            next: 'Open the app’s Print dialog and explicitly select your intended printer. Review Default printer in System Settings → Printers & Scanners if you want a persistent choice, then recheck.',
          };
  else
    finding = items.length
      ? {
          title: 'Choose the queue that is not moving',
          explanation:
            'Inspect the local status of the affected printer below. A pending job is not automatically a stuck job, and an idle queue does not prove a successful print.',
          next: 'Select your printer to see its queue-specific next step, then open that queue in Print Center. After checking the original document and queue, run this check again.',
        }
      : {
          title: 'No printer queues were listed',
          explanation:
            'No configured printer was returned by the local printing service, so there is no queue here to inspect.',
          next: 'Use “I can’t find my printer” to check the configured-printer list. Confirm the intended printer in Printers & Scanners before retrying the document.',
        };
  return {
    ...finding,
    printers: items.map((p) => ({ ...p, finding: printerFinding(p) })),
    evidence,
    checkedAt: new Date().toISOString(),
  };
}
let running;
export async function checkPrinting(kind, run) {
  if (!['printer-missing', 'print-queue', 'printer-default'].includes(kind))
    throw Error('Unknown printing check');
  if (!running)
    running = Promise.all(
      ['print-service', 'printers', 'print-default', 'print-jobs'].map((name) =>
        run(name),
      ),
    )
      .then(([service, printers, defaultValue, jobs]) => ({
        service,
        printers,
        default: defaultValue,
        jobs,
      }))
      .finally(() => {
        running = undefined;
      });
  return interpretPrinting(kind, await running);
}
