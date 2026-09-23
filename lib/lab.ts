import type { IncidentData } from './incidents.ts';
export type Category =
  | 'storage'
  | 'printing'
  | 'network'
  | 'application'
  | 'access'
  | 'database'
  | 'embedded'
  | 'unknown';
export type Status =
  | 'investigating'
  | 'open'
  | 'awaiting'
  | 'resolved'
  | 'escalated'
  | 'declined';
export type Endpoint = {
  diskFreeGB: number;
  temporaryGB: number;
  spooler: 'running' | 'stopped';
  dns: 'stale' | 'healthy';
  gateway: boolean;
};
export type Event = { at: string; title: string; detail: string };
export type Finding = { label: string; value: string; attention: boolean };
export type Ticket = {
  incident?: IncidentData;
  id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  endpoint?: Endpoint;
  findings: Finding[];
  events: Event[];
  note: string;
  plan?: {
    action: 'clear_demo_temp' | 'start_demo_spooler' | 'flush_demo_dns';
    title: string;
    effect: string;
    caution: string;
    kb: keyof typeof knowledge;
  };
};
export const knowledge = {
  'LAB-001': {
    title: 'Low disk space',
    body: 'In this synthetic endpoint, less than 10 GB free triggers investigation. Remove only designated demo temporary data when that would restore at least 10 GB free. Verify free space afterward. Otherwise escalate; never remove user files.',
  },
  'LAB-002': {
    title: 'Stopped print service',
    body: 'Check the demo print-spooler state. If stopped, request approval to start it, then verify it is running. This lab does not clear jobs, access a printer, or prove that a physical page printed.',
  },
  'LAB-003': {
    title: 'Stale DNS cache',
    body: 'Check gateway reachability. If reachable and the synthetic DNS cache is stale, request approval to flush that cache. Verify healthy DNS afterward. An unreachable gateway requires escalation.',
  },
} as const;
export const categoryLabel: Record<Category, string> = {
  application: 'Application',
  access: 'Access & permissions',
  database: 'Database',
  embedded: 'Embedded systems',
  storage: 'Storage',
  printing: 'Printing',
  network: 'Network',
  unknown: 'Needs triage',
};
export const statusLabel: Record<Status, string> = {
  investigating: 'Investigating',
  open: 'Open',
  awaiting: 'Awaiting approval',
  resolved: 'Resolved',
  escalated: 'Escalated',
  declined: 'Fix declined',
};
export function classify(text: string): Category {
  const groups: [Category, RegExp][] = [
    ['storage', /\b(disk|storage|drive full|space|saving files)\b/i],
    ['printing', /\b(print|printer|printing|spooler)\b/i],
    ['network', /\b(dns|internet|network|website|websites|connection)\b/i],
  ];
  const matches = groups.filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : 'unknown';
}
export function fixture(category: Category): Endpoint {
  return {
    diskFreeGB: category === 'storage' ? 2.4 : 64,
    temporaryGB: category === 'storage' ? 12.8 : 0,
    spooler: category === 'printing' ? 'stopped' : 'running',
    dns: category === 'network' ? 'stale' : 'healthy',
    gateway: true,
  };
}
const event = (title: string, detail: string, at: string): Event => ({
  title,
  detail,
  at,
});
export function createTicket(
  id: string,
  title: string,
  description: string,
  at = new Date().toISOString(),
): Ticket {
  const cleanTitle = title.trim(),
    cleanDescription = description.trim();
  if (
    cleanTitle.length < 5 ||
    cleanTitle.length > 120 ||
    cleanDescription.length > 1500
  )
    throw new Error(
      'Use a title of 5–120 characters and a description under 1,500 characters.',
    );
  const category = classify(`${cleanTitle} ${cleanDescription}`);
  return {
    id,
    title: cleanTitle,
    description: cleanDescription,
    category,
    status: 'open',
    endpoint: fixture(category),
    findings: [],
    note: '',
    events: [
      event(
        'Ticket submitted',
        'Synthetic incident opened. No real endpoint is connected.',
        at,
      ),
    ],
  };
}
export function diagnose(
  ticket: Ticket,
  at = new Date().toISOString(),
): Ticket {
  if (ticket.incident)
    throw new Error('Use evidence analysis for this incident.');
  if (!ticket.endpoint) throw new Error('Simulation endpoint is missing.');
  if (ticket.status !== 'open')
    throw new Error('Diagnostics require an open ticket.');
  const t: Ticket = structuredClone(ticket),
    e = t.endpoint!;
  t.plan = undefined;
  t.findings = [
    {
      label: 'Free disk space',
      value: `${e.diskFreeGB.toFixed(1)} GB`,
      attention: e.diskFreeGB < 10,
    },
    {
      label: 'Demo temporary data',
      value: `${e.temporaryGB.toFixed(1)} GB`,
      attention: false,
    },
    {
      label: 'Print spooler',
      value: e.spooler,
      attention: e.spooler === 'stopped',
    },
    { label: 'DNS cache', value: e.dns, attention: e.dns === 'stale' },
    {
      label: 'Gateway',
      value: e.gateway ? 'Reachable' : 'Unreachable',
      attention: !e.gateway,
    },
  ];
  t.events.push(
    event(
      'Diagnostics collected',
      'Read five values from a simulated Windows endpoint. No commands executed.',
      at,
    ),
  );
  if (
    t.category === 'storage' &&
    e.diskFreeGB < 10 &&
    e.temporaryGB > 0 &&
    e.diskFreeGB + e.temporaryGB >= 10
  )
    t.plan = {
      action: 'clear_demo_temp',
      title: 'Clear designated demo temporary data',
      effect: `Free ${e.temporaryGB.toFixed(1)} GB in the simulation. User files remain untouched.`,
      caution:
        'A real implementation needs a directory allowlist and checks for files in use.',
      kb: 'LAB-001',
    };
  else if (t.category === 'printing' && e.spooler === 'stopped')
    t.plan = {
      action: 'start_demo_spooler',
      title: 'Start the demo print spooler',
      effect:
        'Change the simulated print-service state from stopped to running.',
      caution:
        'This verifies service state only, not a physical printer or completed print job.',
      kb: 'LAB-002',
    };
  else if (t.category === 'network' && e.dns === 'stale' && e.gateway)
    t.plan = {
      action: 'flush_demo_dns',
      title: 'Flush the demo DNS cache',
      effect:
        'Clear the stale cache flag in the simulation and verify the updated DNS state.',
      caution:
        'This scenario assumes a stale cache. It does not diagnose upstream DNS servers or live connectivity.',
      kb: 'LAB-003',
    };
  if (t.plan) {
    t.status = 'awaiting';
    t.events.push(
      event(
        'Procedure matched',
        `${t.plan.kb}: ${t.plan.title}. Awaiting your approval.`,
        at,
      ),
    );
  } else {
    t.status = 'escalated';
    t.note =
      'Escalated for technician review. The incident is ambiguous, unsupported, or diagnostic evidence does not meet a supported procedure. No changes made.';
    t.events.push(event('Escalated to a technician', t.note, at));
  }
  return t;
}
export function decide(
  ticket: Ticket,
  approved: boolean,
  at = new Date().toISOString(),
): Ticket {
  if (ticket.incident)
    throw new Error('Real incidents require technician verification.');
  if (!ticket.endpoint) throw new Error('Simulation endpoint is missing.');
  if (ticket.status !== 'awaiting' || !ticket.plan)
    throw new Error('A diagnosed plan awaiting approval is required.');
  const currentPlan = diagnose(
    { ...ticket, status: 'open', plan: undefined, events: [] },
    at,
  ).plan;
  if (
    !currentPlan ||
    currentPlan.action !== ticket.plan.action ||
    currentPlan.kb !== ticket.plan.kb
  )
    throw new Error(
      'Plan no longer matches the endpoint. Start a fresh incident.',
    );
  const t = structuredClone(ticket) as Ticket & { endpoint: Endpoint };
  if (!approved) {
    t.status = 'declined';
    t.note =
      'The proposed action was declined. No endpoint state was changed. Technician follow-up is required.';
    t.events.push(event('Fix declined', t.note, at));
    return t;
  }
  t.events.push(
    event(
      'Approval recorded',
      `You approved: ${currentPlan.title}. Simulated endpoint only.`,
      at,
    ),
  );
  switch (currentPlan.action) {
    case 'clear_demo_temp':
      t.endpoint.diskFreeGB =
        Math.round((t.endpoint.diskFreeGB + t.endpoint.temporaryGB) * 10) / 10;
      t.endpoint.temporaryGB = 0;
      break;
    case 'start_demo_spooler':
      t.endpoint.spooler = 'running';
      break;
    case 'flush_demo_dns':
      t.endpoint.dns = 'healthy';
      break;
    default:
      throw new Error('Unsupported action.');
  }
  const verified =
    currentPlan.action === 'clear_demo_temp'
      ? t.endpoint.diskFreeGB >= 10
      : currentPlan.action === 'start_demo_spooler'
        ? t.endpoint.spooler === 'running'
        : t.endpoint.dns === 'healthy' && t.endpoint.gateway;
  t.status = verified ? 'resolved' : 'escalated';
  const result =
    currentPlan.action === 'clear_demo_temp'
      ? `Free space: ${ticket.endpoint.diskFreeGB.toFixed(1)} → ${t.endpoint.diskFreeGB.toFixed(1)} GB.`
      : currentPlan.action === 'start_demo_spooler'
        ? 'Print spooler: stopped → running.'
        : 'DNS cache: stale → healthy; gateway reachable.';
  t.events.push(
    event('Simulation updated', result, at),
    event(
      verified ? 'Verification passed' : 'Verification failed',
      'Checked the resulting fixture against the procedure’s postcondition.',
      at,
    ),
  );
  t.note = `${t.id} — ${t.title}\n\nCategory: ${categoryLabel[t.category]}\nProcedure: ${currentPlan.kb} — ${knowledge[currentPlan.kb].title}\nAction: ${currentPlan.title}\nApproval: recorded before simulated execution\nResult: ${result}\nStatus: ${statusLabel[t.status]}\n\nTraining-lab result only. Rules and endpoint data are synthetic; no live AI model or real device was used.`;
  return t;
}
export function initialTickets(): Ticket[] {
  const at = '2026-09-07T09:00:00.000Z';
  return [
    createTicket(
      'INC-001',
      'Disk almost full — unable to save files',
      'My workstation is showing a low-storage warning. I cannot save the presentation I’m working on.',
      at,
    ),
    createTicket(
      'INC-002',
      'Documents stuck in the print queue',
      'The office printer is not printing any of my documents. The jobs stay in the queue.',
      at,
    ),
    createTicket(
      'INC-003',
      'Websites won’t load on my workstation',
      'My internet connection looks active, but websites are not loading.',
      at,
    ),
  ];
}
