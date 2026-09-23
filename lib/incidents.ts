import type { AIInvestigation } from './ai-types.ts';
import {
  createTicket,
  categoryLabel,
  statusLabel,
  type Ticket,
  type Category,
} from './lab.ts';

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export const priorityLabel = {
  P1: 'P1 · Critical',
  P2: 'P2 · High',
  P3: 'P3 · Normal',
  P4: 'P4 · Low',
};
export type Analysis = {
  at: string;
  matches: { id: string; lines: number[]; excerpts: string[] }[];
  lineCount: number;
};
export type IncidentData = {
  source: 'reported' | 'example';
  priority: Priority;
  asset: string;
  evidence: string;
  analysis?: Analysis;
  ai?: AIInvestigation;
};
type Guide = {
  id: string;
  title: string;
  category: Category;
  pattern: RegExp;
  meaning: string;
  checks: string[];
  verify: string;
  source: string;
  example: string;
};
const nodeDocs = 'https://nodejs.org/api/errors.html';
const pgDocs = 'https://www.postgresql.org/docs/current/errcodes-appendix.html';
export const guides: Guide[] = [
  {
    id: 'disk',
    title: 'Write fails: storage exhausted',
    category: 'storage',
    pattern: /\bENOSPC\b|no space left on device/i,
    meaning:
      'A write reported a capacity limit. This does not identify which volume or quota is responsible.',
    checks: [
      'Identify the path and filesystem involved in the failed write.',
      'Check free bytes, inodes, and any container or user quota.',
      'Identify growth since the last successful run before choosing a cleanup or capacity change.',
    ],
    verify:
      'Repeat the original write and record available capacity on the affected volume.',
    source: nodeDocs,
    example:
      '2026-09-08T10:02:01Z worker: ERROR ENOSPC: no space left on device, write /var/log/app/events.log',
  },
  {
    id: 'dns',
    title: 'Service hostname cannot be resolved',
    category: 'network',
    pattern: /\b(ENOTFOUND|EAI_AGAIN)\b|name or service not known/i,
    meaning:
      'Name lookup failed. A typo, resolver issue, or missing record needs investigation.',
    checks: [
      'Compare the exact hostname with the service configuration.',
      'Check resolution from the affected environment.',
      'Compare results with a working environment and record resolver differences.',
    ],
    verify:
      'Repeat name lookup and the original request from the affected environment.',
    source: nodeDocs,
    example:
      '2026-09-08T10:04:11Z api: getaddrinfo ENOTFOUND inventory.internal',
  },
  {
    id: 'refused',
    title: 'Service connection refused',
    category: 'network',
    pattern: /\bECONNREFUSED\b|connection refused/i,
    meaning:
      'A connection attempt was refused; service availability and the target address need checking.',
    checks: [
      'Confirm the destination host and port.',
      'Check whether the expected service is listening there.',
      'Compare application configuration with the deployed service endpoint.',
    ],
    verify: 'Repeat the application request and record the response.',
    source: nodeDocs,
    example:
      '2026-09-08T10:05:00Z gateway: connect ECONNREFUSED 127.0.0.1:8080',
  },
  {
    id: 'timeout',
    title: 'Request times out',
    category: 'network',
    pattern: /\bETIMEDOUT\b|connection timed out/i,
    meaning: 'A request exceeded its wait limit. The cause is not established.',
    checks: [
      'Record the destination, duration, and when failures started.',
      'Check affected versus unaffected clients.',
      'Compare dependency health and recent network or deployment changes.',
    ],
    verify: 'Repeat representative requests and record latency and failures.',
    source: nodeDocs,
    example: '2026-09-08T10:06:00Z worker: connect ETIMEDOUT 192.0.2.10:443',
  },
  {
    id: 'permission',
    title: 'Application cannot access a file',
    category: 'access',
    pattern: /\bEACCES\b|permission denied/i,
    meaning:
      'An access check failed. Verify the execution identity and the affected resource.',
    checks: [
      'Identify the user or service account running the operation.',
      'Inspect permissions on the resource and its parent directories.',
      'Compare required access with the intended permission policy.',
    ],
    verify:
      'Retry as the same service identity and record success without broadening unrelated access.',
    source: nodeDocs,
    example:
      '2026-09-08T10:07:00Z agent: EACCES: permission denied, open /var/lib/app/state.json',
  },
  {
    id: 'port',
    title: 'Application port already in use',
    category: 'application',
    pattern: /\bEADDRINUSE\b|address already in use/i,
    meaning: 'The requested address is already occupied.',
    checks: [
      'Identify the process using the configured address and port.',
      'Check for a duplicate service instance or conflicting configuration.',
      'Confirm which service should own the address before changing anything.',
    ],
    verify:
      'Confirm the intended service starts and responds on its configured endpoint.',
    source: nodeDocs,
    example:
      '2026-09-08T10:08:00Z server: listen EADDRINUSE: address already in use 0.0.0.0:3000',
  },
  {
    id: 'missing',
    title: 'Required file is missing',
    category: 'application',
    pattern: /\bENOENT\b|no such file or directory/i,
    meaning: 'A referenced path was not found.',
    checks: [
      'Compare the resolved path with the expected deployment layout.',
      'Check the working directory and filename case.',
      'Check whether a required build artifact or mounted file is present.',
    ],
    verify:
      'Repeat the failed operation using the intended deployed configuration.',
    source: nodeDocs,
    example:
      '2026-09-08T10:09:00Z service: ENOENT: no such file or directory, open ./config/device.json',
  },
  {
    id: 'db-auth',
    title: 'Database authentication rejected',
    category: 'database',
    pattern: /\b28P01\b|password authentication failed for user/i,
    meaning: 'The database reported an authentication failure.',
    checks: [
      'Confirm the intended database endpoint and username.',
      'Check which secret version the application uses without pasting credentials.',
      'Correlate the failure with credential rotation or configuration changes.',
    ],
    verify:
      'Confirm the application can authenticate and perform its intended query.',
    source: pgDocs,
    example:
      '2026-09-08T10:10:00Z postgres: SQLSTATE 28P01 password authentication failed for user "app_reader"',
  },
  {
    id: 'db-pool',
    title: 'Database connection capacity reached',
    category: 'database',
    pattern: /\b53300\b|too many (clients|connections)/i,
    meaning: 'Database connection capacity has been reached.',
    checks: [
      'Compare active connections with configured limits.',
      'Inspect application pool settings across all instances.',
      'Look for connections retained after requests complete.',
    ],
    verify:
      'Run representative requests and record stable connection counts and successful queries.',
    source: pgDocs,
    example:
      '2026-09-08T10:11:00Z postgres: FATAL SQLSTATE 53300 too many connections',
  },
  {
    id: 'watchdog',
    title: 'Device reports a kernel lockup',
    category: 'embedded',
    pattern:
      /watchdog.*(?:soft lockup|hard lockup)|soft lockup.*CPU|hard LOCKUP/i,
    meaning:
      'A watchdog reported a kernel lockup. The log alone does not identify the faulty code or hardware.',
    checks: [
      'Capture the surrounding stack trace, device model, and firmware or kernel build.',
      'Record uptime, workload, and the last known good build.',
      'Compare repeat failures and recent driver or firmware changes.',
    ],
    verify:
      'Reproduce the original workload on the affected build or documented fix and record whether the lockup returns.',
    source: 'https://docs.kernel.org/admin-guide/lockup-watchdogs.html',
    example:
      '2026-09-08T10:12:00Z kernel: watchdog: BUG: soft lockup - CPU#0 stuck for 26s! [sensor-agent:418]',
  },
];
export function newIncident(
  id: string,
  title: string,
  description: string,
  input: IncidentData,
  category: Category,
  at = new Date().toISOString(),
): Ticket {
  const t = createTicket(id, title, description, at);
  delete t.endpoint;
  t.category = category;
  t.incident = input;
  t.events = [
    {
      at,
      title:
        input.source === 'example'
          ? 'Example incident created'
          : 'Incident reported',
      detail:
        'Evidence workspace opened. No device connection or automated execution.',
    },
  ];
  return t;
}
export function analyzeEvidence(
  evidence: string,
  at = new Date().toISOString(),
): Analysis {
  const lines = evidence.split(/\r?\n/);
  return {
    at,
    lineCount: lines.length,
    matches: guides.flatMap((g) => {
      const hits = lines.flatMap((line, i) =>
        g.pattern.test(line)
          ? [{ number: i + 1, text: line.slice(0, 500) }]
          : [],
      );
      return hits.length
        ? [
            {
              id: g.id,
              lines: hits.map((h) => h.number),
              excerpts: hits.slice(0, 3).map((h) => h.text),
            },
          ]
        : [];
    }),
  };
}
export type WorkOperation =
  | 'evidence'
  | 'analyze'
  | 'comment'
  | 'resolve'
  | 'reopen'
  | 'escalate'
  | 'details';
export function workIncident(
  ticket: Ticket,
  operation: WorkOperation,
  input: Record<string, unknown>,
  at = new Date().toISOString(),
): Ticket {
  if (!ticket.incident)
    throw new Error('Use the simulation controls for this legacy example.');
  const t = structuredClone(ticket),
    data = t.incident!;
  if (t.events.length >= 250)
    throw new Error(
      'This incident has reached its activity limit. Export its record and create a follow-up incident.',
    );
  const add = (title: string, detail: string) =>
    t.events.push({ at, title, detail });
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (operation === 'reopen') {
    if (t.status !== 'resolved')
      throw new Error('Only a resolved incident can be reopened.');
    if (text.length < 10)
      throw new Error(
        'Explain why the incident needs reopening (at least 10 characters).',
      );
    t.status = 'investigating';
    add('Incident reopened', text);
  } else {
    if (t.status === 'resolved')
      throw new Error('Reopen this incident before making changes.');
    if (operation === 'evidence') {
      if (!text) throw new Error('Paste log output or observations first.');
      data.evidence = text;
      data.analysis = undefined;
      data.ai = undefined;
      add(
        'Evidence updated',
        'Replaced the evidence snapshot; previous analysis is no longer current.',
      );
    } else if (operation === 'analyze') {
      if (!data.evidence.trim())
        throw new Error('Save evidence before running analysis.');
      data.analysis = analyzeEvidence(data.evidence, at);
      t.status = 'investigating';
      const matches = data.analysis.matches.map((m) =>
        guides.find((g) => g.id === m.id)!,
      );
      if (
        t.category === 'unknown' &&
        matches.length &&
        matches.every((g) => g.category === matches[0].category)
      )
        t.category = matches[0].category;
      add(
        'Evidence analyzed',
        `${matches.length} recognized error patterns across ${data.analysis.lineCount} lines. Pattern matching only; root cause is not confirmed.`,
      );
    } else if (operation === 'details') {
      data.ai = undefined;
      data.priority = input.priority as Priority;
      data.asset = String(input.asset).trim();
      t.category = input.category as Category;
      add(
        'Triage updated',
        `${data.priority} · ${categoryLabel[t.category]} · ${data.asset || 'No affected asset specified'}`,
      );
    } else if (operation === 'comment') {
      if (!text) throw new Error('Write a technician note first.');
      add('Technician note', text);
    } else if (operation === 'resolve') {
      if (text.length < 20)
        throw new Error(
          'Record what changed and how you verified it (at least 20 characters).',
        );
      t.status = 'resolved';
      t.note = text;
      add('Resolution recorded by technician', text);
    } else if (operation === 'escalate') {
      if (text.length < 10)
        throw new Error('Add a handoff reason (at least 10 characters).');
      t.status = 'escalated';
      add('Escalated for follow-up', text);
    }
  }
  return t;
}
export function incidentReport(t: Ticket): string {
  const d = t.incident;
  return [
    `${t.id} — ${t.title}`,
    `Status: ${statusLabel[t.status]} | Category: ${categoryLabel[t.category]}`,
    d
      ? `Source: ${d.source} | Priority: ${d.priority} | Asset: ${d.asset || 'Not supplied'}`
      : 'Source: simulated endpoint',
    '',
    t.description,
    '',
    'EVIDENCE',
    d?.evidence || 'No uploaded evidence',
    '',
    'ANALYSIS',
    ...(d?.analysis?.matches.map((m) => {
      const g = guides.find((g) => g.id === m.id)!;
      return `${g.title} — lines ${m.lines.join(', ')}\n${g.meaning}\nChecks: ${g.checks.join(' ')}\nVerification: ${g.verify}\nReference: ${g.source}`;
    }) || []),
    'Pattern matches are investigation leads, not confirmed causes.',
    '',
    'AI INVESTIGATION',
    d?.ai ? JSON.stringify(d.ai, null, 2) : 'Not requested',
    '',
    'RESOLUTION',
    t.note || 'Not resolved',
    '',
    'ACTIVITY',
    ...t.events.map((e) => `${e.at} | ${e.title}\n${e.detail}`),
  ].join('\n');
}
