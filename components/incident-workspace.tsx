'use client';
import Link from 'next/link';
import { useState } from 'react';
import { captureSummary } from '@/lib/troubleshooting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { categoryLabel, knowledge, statusLabel } from '@/lib/lab';
import {
  guides,
  priorityLabel,
  incidentReport,
  type WorkOperation,
} from '@/lib/incidents';
import type { SavedTicket } from '@/lib/ticket-store';
export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="choice">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(String(v));
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue>{options[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([v, l]) => (
            <SelectItem value={v} key={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function downloadReport(ticket: SavedTicket) {
  const url = URL.createObjectURL(
    new Blob([incidentReport(ticket)], { type: 'text/plain;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ticket.id}-report.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
type Work = (
  ticket: SavedTicket,
  operation: WorkOperation,
  input?: Record<string, unknown>,
) => Promise<SavedTicket>;
export function IncidentWorkspace({
  ticket,
  busy,
  work,
}: {
  ticket: SavedTicket;
  busy: boolean;
  work: Work;
}) {
  const data = ticket.incident!;
  const capture = captureSummary(data.evidence);
  const [evidence, setEvidence] = useState(data.evidence),
    [note, setNote] = useState('');
  const [priority, setPriority] = useState(data.priority as string),
    [category, setCategory] = useState(ticket.category as string),
    [asset, setAsset] = useState(data.asset);
  const [localError, setLocalError] = useState(''),
    [tab, setTab] = useState('evidence');
  const closed = ticket.status === 'resolved',
    dirty = evidence !== data.evidence;
  async function action(
    op: WorkOperation,
    input: Record<string, unknown> = {},
  ) {
    setLocalError('');
    try {
      const next = await work(ticket, op, input);
      if (['comment', 'resolve', 'reopen', 'escalate'].includes(op))
        setNote('');
      if (op === 'analyze') setCategory(next.category);
      if (op === 'evidence') setEvidence(next.incident!.evidence);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not save.');
    }
  }
  return (
    <>
      {capture && (
        <div className="lab-banner" style={{ marginBottom: 20 }}>
          <div>
            <strong>What your Chrome capture tells us</strong>
            <p>{capture.message}</p>
            <p>
              {capture.background} background checks · {capture.actions.length}{' '}
              other requests · {capture.failures.length} failed requests
            </p>
            <Link href="/troubleshoot">Troubleshoot a specific problem →</Link>
          </div>
        </div>
      )}
      <div className="triage-fields">
        <Choice
          label="Priority"
          value={priority}
          options={priorityLabel}
          onChange={setPriority}
          disabled={busy || closed}
        />
        <Choice
          label="Category"
          value={category}
          options={categoryLabel}
          onChange={setCategory}
          disabled={busy || closed}
        />
        <label className="asset-field" htmlFor="selected-asset">
          Affected asset / service
          <Input
            id="selected-asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            maxLength={120}
            placeholder="e.g. sensor-gateway-01"
            disabled={busy || closed}
          />
        </label>
        <Button
          variant="outline"
          disabled={
            busy ||
            closed ||
            (priority === data.priority &&
              category === ticket.category &&
              asset === data.asset)
          }
          onClick={() => void action('details', { priority, category, asset })}
        >
          Save triage
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(String(v))}
        className="investigation-tabs"
      >
        <TabsList variant="line" className="tab-bar">
          <TabsTrigger value="evidence">Evidence & findings</TabsTrigger>
          <TabsTrigger value="work">Work notes</TabsTrigger>
          <TabsTrigger value="activity">
            Activity ({ticket.events.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="evidence" className="tab-content">
          <div className="section-label">
            <h3>Logs and observations</h3>
            <span>{evidence.length.toLocaleString()} / 6,000 characters</span>
          </div>
          <p className="field-help">
            Paste relevant output or import a text log. Remove passwords,
            tokens, and personal data before saving.
          </p>
          <Textarea
            aria-label="Incident evidence"
            className="log-editor"
            value={evidence}
            maxLength={6000}
            disabled={busy || closed}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Paste the exact error and surrounding log lines…"
          />
          <div className="evidence-actions">
            <label className="import-label">
              Import .txt / .log
              <input
                type="file"
                accept=".txt,.log,text/plain"
                disabled={busy || closed}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLocalError('');
                  try {
                    if (file.size > 24000)
                      throw new Error(
                        'Choose a short log excerpt under 24 KB.',
                      );
                    const text = await file.text();
                    if (text.length > 6000)
                      throw new Error(
                        'This file is over 6,000 characters. Import a shorter excerpt.',
                      );
                    if (text.includes('\u0000'))
                      throw new Error('Choose a plain-text file.');
                    setEvidence(text);
                  } catch (error) {
                    setLocalError(
                      error instanceof Error
                        ? error.message
                        : 'Could not read file.',
                    );
                  }
                  e.target.value = '';
                }}
              />
            </label>
            <Button
              variant="outline"
              disabled={busy || closed || !dirty || !evidence.trim()}
              onClick={() => void action('evidence', { text: evidence })}
            >
              Save evidence
            </Button>
            <Button
              className="primary-button"
              disabled={busy || closed || dirty || !data.evidence.trim()}
              onClick={() => void action('analyze')}
            >
              {busy ? 'Working…' : 'Analyze saved evidence'}
            </Button>
          </div>
          {dirty && (
            <p className="field-help">
              Unsaved changes. Save evidence before analyzing it.
            </p>
          )}
          {data.analysis && (
            <div className="analysis-results">
              <div className="section-label">
                <h3>
                  {data.analysis.matches.length
                    ? `${data.analysis.matches.length} investigation leads`
                    : 'No recognized error signatures'}
                </h3>
                <span>
                  Rule-based · {data.analysis.lineCount} lines checked
                </span>
              </div>
              <p className="field-help">
                These are pattern matches, not confirmed root causes. No
                commands have been executed.
              </p>
              {!data.analysis.matches.length && (
                <div className="guide-card">
                  <h4>Continue manual investigation</h4>
                  <p>
                    Record the exact error, the expected behavior, affected
                    devices, and when the issue began. Compare one failing case
                    with one working case. Add those observations here or
                    escalate with a handoff note.
                  </p>
                </div>
              )}
              {data.analysis.matches.map((m) => {
                const g = guides.find((g) => g.id === m.id);
                if (!g) return null;
                return (
                  <article className="guide-card" key={m.id}>
                    <div className="section-label">
                      <h4>{g.title}</h4>
                      <span>
                        Lines {m.lines.slice(0, 12).join(', ')}
                        {m.lines.length > 12 ? '…' : ''}
                      </span>
                    </div>
                    <p>{g.meaning}</p>
                    <pre className="evidence-excerpt">
                      {m.excerpts.join('\n')}
                    </pre>
                    <h5>What to check next</h5>
                    <ol>
                      {g.checks.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ol>
                    <h5>Verify the outcome</h5>
                    <p>{g.verify}</p>
                    <a href={g.source} target="_blank" rel="noreferrer">
                      Technical reference ↗
                    </a>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="work" className="tab-content">
          <h3 className="work-title">
            {closed ? 'Resolution recorded' : 'Document the investigation'}
          </h3>
          {ticket.note && <pre className="resolution-note">{ticket.note}</pre>}
          <p className="field-help">
            {closed
              ? 'If the issue returns, describe what happened and reopen it.'
              : 'Record checks, results, or a handoff reason. To resolve, describe the fix and how you confirmed the original problem is gone.'}
          </p>
          <Textarea
            aria-label="Technician note or verification result"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            placeholder={
              closed
                ? 'Reason for reopening…'
                : 'What did you check? What changed? What was the result?'
            }
          />
          <div className="plan-actions">
            {closed ? (
              <Button
                disabled={busy || note.trim().length < 10}
                onClick={() => void action('reopen', { text: note })}
              >
                Reopen incident
              </Button>
            ) : (
              <>
                <Button
                  disabled={busy || !note.trim()}
                  variant="outline"
                  onClick={() => void action('comment', { text: note })}
                >
                  Add work note
                </Button>
                <Button
                  disabled={busy || note.trim().length < 10}
                  variant="outline"
                  onClick={() => void action('escalate', { text: note })}
                >
                  Escalate with note
                </Button>
                <Button
                  className="primary-button"
                  disabled={busy || note.trim().length < 20}
                  onClick={() => void action('resolve', { text: note })}
                >
                  Record verified resolution
                </Button>
              </>
            )}
          </div>
          <p className="field-help">
            Resolution is your recorded verification; ResolveAI cannot check a
            disconnected device.
          </p>
        </TabsContent>
        <TabsContent value="activity" className="tab-content">
          <ActivityLog ticket={ticket} />
        </TabsContent>
      </Tabs>
      {localError && (
        <p role="alert" className="error">
          {localError}
        </p>
      )}
    </>
  );
}
export function ActivityLog({ ticket }: { ticket: SavedTicket }) {
  return (
    <ol className="timeline">
      {ticket.events.map((e, i) => (
        <li key={`${i}-${e.at}`}>
          <span className="timeline-dot" />
          <div>
            <div className="event-heading">
              <h4>{e.title}</h4>
              <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
            </div>
            <p>{e.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function SimulationWorkspace({
  ticket,
  busy,
  change,
}: {
  ticket: SavedTicket;
  busy: boolean;
  change: (op: 'diagnose' | 'approve' | 'decline') => void;
}) {
  return (
    <div className="tab-content">
      <p className="simulation-label">
        Simulated Windows endpoint · changes affect this example only
      </p>
      {ticket.status === 'open' && (
        <Button
          className="primary-button"
          disabled={busy}
          onClick={() => change('diagnose')}
        >
          Run demo diagnostics
        </Button>
      )}
      <div className="findings">
        {ticket.findings.map((f) => (
          <div
            key={f.label}
            className={`finding ${f.attention ? 'attention' : ''}`}
          >
            <span>{f.label}</span>
            <strong>{f.value}</strong>
          </div>
        ))}
      </div>
      {ticket.plan && (
        <div className="plan-panel">
          <h3>{ticket.plan.title}</h3>
          <p>{ticket.plan.effect}</p>
          <details>
            <summary>Procedure and limits</summary>
            <p>{knowledge[ticket.plan.kb].body}</p>
            <p>{ticket.plan.caution}</p>
          </details>
          {ticket.status === 'awaiting' && (
            <div className="plan-actions">
              <Button disabled={busy} onClick={() => change('approve')}>
                Approve & run simulated fix
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => change('decline')}
              >
                Decline
              </Button>
            </div>
          )}
        </div>
      )}
      {ticket.note && <pre className="resolution-note">{ticket.note}</pre>}
      <ActivityLog ticket={ticket} />
      <p className="field-help">
        {statusLabel[ticket.status]} · This legacy example does not use supplied
        logs.
      </p>
    </div>
  );
}
