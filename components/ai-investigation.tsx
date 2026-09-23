'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SavedTicket } from '@/lib/ticket-store';
type Budget = {
  configured: boolean;
  reservedCents: number;
  limitCents: number;
};
export function AIInvestigationPanel({
  ticket,
  busy,
  onResult,
}: {
  ticket: SavedTicket;
  busy: boolean;
  onResult: (t: SavedTicket) => void;
}) {
  const [running, setRunning] = useState(false),
    [error, setError] = useState('');
  const [budget, setBudget] = useState<{
    configured: boolean;
    reservedCents: number;
    limitCents: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/ai', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) {
          if (d) setBudget(d as Budget);
          else setError('Unable to check the AI connection. Refresh to retry.');
        }
      })
      .catch(() => {
        if (active)
          setError('Unable to check the AI connection. Refresh to retry.');
      });
    return () => {
      active = false;
    };
  }, [ticket.id, running]);
  async function investigate() {
    setRunning(true);
    setError('');
    try {
      const r = await fetch(
        `/api/tickets/${encodeURIComponent(ticket.id)}/ai`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: ticket.revision }),
        },
      );
      const d = (await r.json()) as { error?: string; ticket: SavedTicket };
      if (!r.ok) throw new Error(d.error || 'AI investigation failed.');
      onResult(d.ticket);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reach AI.');
    } finally {
      setRunning(false);
    }
  }
  const ai = ticket.incident?.ai;
  return (
    <section className="ai-panel">
      <div className="section-label">
        <div>
          <span className="eyebrow">GPT-5.6 LUNA</span>
          <h3>AI investigation</h3>
        </div>
        <Button
          className="primary-button"
          disabled={
            busy ||
            running ||
            !budget?.configured ||
            budget.reservedCents >= budget.limitCents ||
            ticket.status === 'resolved' ||
            !ticket.incident?.evidence.trim()
          }
          onClick={() => void investigate()}
        >
          {running ? 'Investigating…' : 'Ask AI to investigate'}
        </Button>
      </div>
      <p className="field-help">
        Sends this incident’s saved title, description, asset, and evidence to
        OpenAI. AI suggests causes and checks; it cannot execute fixes. Save any
        evidence edits first.
      </p>
      <p className="ai-budget">
        {budget
          ? budget.configured
            ? `Test allowance: $${(budget.reservedCents / 100).toFixed(2)} reserved / $${(budget.limitCents / 100).toFixed(2)} USD. One cent reserved per attempt, including failures; actual API cost is usually lower.`
            : 'AI connection is not configured on this deployment.'
          : 'Checking AI connection…'}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {ai && (
        <div className="ai-result">
          <p>{ai.summary}</p>
          {ai.hypotheses.map((h, i) => (
            <article className="guide-card" key={i}>
              <h4>{h.cause}</h4>
              <p className="field-help">
                Supporting evidence: lines {h.evidenceLines.join(', ')}
              </p>
              <pre className="evidence-excerpt">
                {h.evidenceLines
                  .map(
                    (n) =>
                      `${n}: ${ticket.incident!.evidence.split(/\r?\n/)[n - 1]}`,
                  )
                  .join('\n')}
              </pre>
              <h5>Next check</h5>
              <p>{h.check}</p>
            </article>
          ))}
          {!!ai.missingInformation.length && (
            <>
              <h4>Information still needed</h4>
              <ul>
                {ai.missingInformation.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {!!ai.verification.length && (
            <>
              <h4>How to verify a fix</h4>
              <ul>
                {ai.verification.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <p className="field-help">
            AI-generated suggestions · {new Date(ai.at).toLocaleString()} ·
            Review before acting.
          </p>
        </div>
      )}
    </section>
  );
}
