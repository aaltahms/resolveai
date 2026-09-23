'use client';
import { LocalNavigation } from '@/components/local-navigation';
import { AIInvestigationPanel } from '@/components/ai-investigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Plus,
  Search,
  Download,
  BookOpen,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Choice,
  IncidentWorkspace,
  SimulationWorkspace,
  downloadReport,
} from '@/components/incident-workspace';
import { categoryLabel, statusLabel } from '@/lib/lab';
import { guides, priorityLabel, type WorkOperation } from '@/lib/incidents';
import type { SavedTicket } from '@/lib/ticket-store';
import { useLabTools } from '@/lib/use-lab-tools';
async function api(path: string, body?: object, method = 'POST') {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = (await response.json()) as {
    error?: string;
    tickets: SavedTicket[];
    ticket: SavedTicket;
  };
  if (!response.ok)
    throw new Error(data.error || 'Unable to complete the request.');
  return data;
}
const blank = {
  title: '',
  description: '',
  source: 'reported',
  category: 'unknown',
  priority: 'P3',
  asset: '',
  evidence: '',
};
export default function Home() {
  const [tickets, setTickets] = useState<SavedTicket[]>([]),
    [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('active'),
    [sourceFilter, setSourceFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false),
    [draft, setDraft] = useState({ ...blank });
  const [localLab, setLocalLab] = useState(false);
  const lock = useRef(false);
  const ticket = tickets.find((t) => t.id === selected);
  async function refresh() {
    const d = await api('/api/tickets');
    setTickets(d.tickets);
    return d.tickets;
  }
  useEffect(() => {
    let active = true;
    api('/api/tickets')
      .then((d) => {
        if (active) {
          setLocalLab(
            ['127.0.0.1', 'localhost'].includes(window.location.hostname),
          );
          setTickets(d.tickets);
          setSelected(
            d.tickets.find(
              (t) =>
                t.id ===
                new URLSearchParams(window.location.search).get('incident'),
            )?.id ||
              d.tickets.find((t) => t.incident)?.id ||
              d.tickets[0]?.id ||
              '',
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run<T>(task: () => Promise<T>): Promise<T> {
    if (lock.current) throw new Error('Another operation is in progress.');
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      return await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function change(
    t: SavedTicket,
    operation: string,
    input: Record<string, unknown> = {},
    real = false,
  ) {
    return run(async () => {
      try {
        const d = await api(
          `/api/tickets/${encodeURIComponent(t.id)}${real ? '/work' : ''}`,
          { operation, revision: t.revision, ...input },
          'PATCH',
        );
        setTickets((all) =>
          all.map((old) => (old.id === t.id ? d.ticket : old)),
        );
        setMessage('Incident saved.');
        return d.ticket;
      } catch (e) {
        try {
          await refresh();
        } catch {}
        throw e;
      }
    });
  }
  const work = (
    t: SavedTicket,
    op: WorkOperation,
    input?: Record<string, unknown>,
  ) => change(t, op, input, true);
  useLabTools({
    tickets,
    investigate: (id) => {
      const t = tickets.find((t) => t.id === id);
      if (!t) return Promise.reject(new Error('Ticket not found.'));
      return t.incident ? work(t, 'analyze') : change(t, 'diagnose');
    },
  });
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(async () => {
      const d = await api('/api/tickets', draft);
      setTickets((all) => [...all, d.ticket]);
      setSelected(d.ticket.id);
      setFilter('all');
      setSourceFilter('all');
      setSearch('');
      setNewOpen(false);
      setDraft({ ...blank });
      setMessage('Incident created.');
    }).catch(() => {});
  }
  const visible = tickets
    .filter(
      (t) =>
        (filter === 'all' ||
          (filter === 'active'
            ? t.status !== 'resolved'
            : t.status === filter)) &&
        (sourceFilter === 'all' ||
          (sourceFilter === 'reported'
            ? t.incident?.source === 'reported'
            : t.incident?.source !== 'reported')) &&
        `${t.id} ${t.title} ${t.description} ${t.incident?.asset || ''} ${categoryLabel[t.category]}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (a.incident?.priority || 'P3').localeCompare(
          b.incident?.priority || 'P3',
        ) || b.events[0].at.localeCompare(a.events[0].at),
    );
  function openNew() {
    setDraft({ ...blank });
    setError('');
    setNewOpen(true);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to incidents
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={22} />
          </span>
          <span>
            Resolve<span className="brand-ai">AI</span>
          </span>
          <span className="version">INCIDENT WORKSPACE</span>
        </div>
        <span className="environment">
          <span />
          Private workspace
        </span>
      </header>
      <LocalNavigation current="desk" />
      <main className="main">
        <div
          className="lab-banner"
          style={{ marginBottom: 24, justifyContent: 'space-between' }}
        >
          <div>
            <strong>Troubleshoot an IT problem</strong>
            <p>
              Start with symptoms, follow checks, and record whether the fix
              worked.
            </p>
          </div>
          <Link href="/troubleshoot" style={{ fontWeight: 700 }}>
            Find a fix →
          </Link>
        </div>
        {localLab && (
          <div
            className="lab-banner"
            style={{ justifyContent: 'space-between', marginBottom: 24 }}
          >
            <div>
              <strong>Local service diagnostics & repair</strong>
              <p>
                Diagnose the project’s saving service, review a supported
                repair, and verify that records can be saved again.
              </p>
            </div>
            <a
              href="http://127.0.0.1:4318/"
              style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Open diagnostics & repair →
            </a>
          </div>
        )}
        <div className="page-heading">
          <div>
            <div className="eyebrow">INVESTIGATE · DOCUMENT · VERIFY</div>
            <h1>Incident desk</h1>
            <p>
              Bring the evidence. Track the work. Record what actually fixed it.
            </p>
          </div>
          <div className="heading-actions">
            <Button variant="outline" onClick={() => setLibraryOpen(true)}>
              <BookOpen size={17} />
              Incident library
            </Button>
            <Button className="primary-button" onClick={openNew}>
              <Plus size={18} />
              New incident
            </Button>
          </div>
        </div>
        <div className="lab-banner">
          <Activity size={18} />
          <p>
            <strong>Log analysis is available.</strong> Save an error log to
            find matching investigation guides and ask AI to investigate.
            Devices are not controlled remotely.
          </p>
        </div>
        <section className="metrics" aria-label="Incident counts">
          <div>
            <div>
              <span className="metric-label">Open work</span>
              <strong>
                {tickets.filter((t) => t.status !== 'resolved').length}
              </strong>
            </div>
          </div>
          <div>
            <div>
              <span className="metric-label">High priority · unresolved</span>
              <strong>
                {
                  tickets.filter(
                    (t) =>
                      t.status !== 'resolved' &&
                      ['P1', 'P2'].includes(t.incident?.priority || ''),
                  ).length
                }
              </strong>
            </div>
          </div>
          <div>
            <div>
              <span className="metric-label">Resolved records</span>
              <strong>
                {tickets.filter((t) => t.status === 'resolved').length}
              </strong>
            </div>
          </div>
          <div className="session-detail">
            <span className="live-dot" />
            <div>
              <strong>
                {
                  tickets.filter((t) => t.incident?.source === 'reported')
                    .length
                }{' '}
                reported ·{' '}
                {
                  tickets.filter((t) => t.incident?.source !== 'reported')
                    .length
                }{' '}
                examples
              </strong>
              <span>Examples included in these totals</span>
            </div>
          </div>
        </section>
        {error && (
          <div className="error" role="alert">
            {error}
            <div className="error-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(refresh)
                    .then(() => setMessage('Workspace refreshed.'))
                    .catch(() => {})
                }
              >
                <RefreshCw size={14} />
                Retry connection
              </Button>
              {error.includes('Sign in') && (
                // oxlint-disable-next-line next/no-html-link-for-pages -- Platform sign-in requires top-level navigation.
                <a href="/signin-with-chatgpt?return_to=/" target="_top">
                  Sign in to ResolveAI
                </a>
              )}
            </div>
          </div>
        )}
        <div className="workspace" id="workspace">
          <aside className="queue">
            <div className="queue-heading">
              <h2>Incident queue</h2>
              <span>{visible.length}</span>
            </div>
            <div className="queue-filters">
              <label className="search-field" htmlFor="incident-search">
                <Search size={16} />
                <Input
                  id="incident-search"
                  aria-label="Search incidents"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search incidents or assets"
                />
              </label>
              <Choice
                label="Status"
                value={filter}
                options={{
                  active: 'Unresolved',
                  all: 'All statuses',
                  ...statusLabel,
                }}
                onChange={setFilter}
              />
              <Choice
                label="Source"
                value={sourceFilter}
                options={{
                  all: 'All records',
                  reported: 'Reported incidents',
                  examples: 'Examples only',
                }}
                onChange={setSourceFilter}
              />
            </div>
            <div className="ticket-list">
              {visible.map((t) => (
                <button
                  key={t.id}
                  className={`ticket-card ${t.id === selected ? 'selected' : ''}`}
                  disabled={busy}
                  aria-pressed={t.id === selected}
                  onClick={() => {
                    setSelected(t.id);
                    setError('');
                  }}
                >
                  <div className="ticket-meta">
                    <span>
                      {t.incident?.source === 'reported'
                        ? 'REPORTED'
                        : t.incident
                          ? 'LOG EXAMPLE'
                          : 'SIMULATION'}
                    </span>
                    <span
                      className={`priority-tag ${t.incident?.priority || ''}`}
                    >
                      {t.incident?.priority || 'Demo'}
                    </span>
                  </div>
                  <h3>{t.title}</h3>
                  <div className="ticket-bottom">
                    <span>{categoryLabel[t.category]}</span>
                    <span className={`status-text ${t.status}`}>
                      {statusLabel[t.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {!visible.length && (
              <p className="queue-caption">
                {loading
                  ? 'Loading saved incidents…'
                  : 'No incidents match these filters.'}
              </p>
            )}
            <div className="queue-tip">
              <p>
                Sorted by priority, then newest first. Examples remain separate
                from reported incidents.
              </p>
            </div>
          </aside>
          <section className="incident" aria-label="Selected incident">
            {ticket ? (
              <>
                <div className="incident-header">
                  <div className="breadcrumb">
                    <span title={ticket.id}>{ticket.id.slice(0, 12)}</span>
                    <span>
                      {ticket.incident?.source === 'reported'
                        ? 'Reported incident'
                        : ticket.incident
                          ? 'Example logs'
                          : 'Simulated device'}
                    </span>
                    <span className={`status-pill ${ticket.status}`}>
                      {statusLabel[ticket.status]}
                    </span>
                  </div>
                  <h2>{ticket.title}</h2>
                  <p>{ticket.description || 'No description supplied.'}</p>
                  <div className="incident-toolbar">
                    <span>
                      {ticket.incident?.asset || 'No affected asset specified'}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => downloadReport(ticket)}
                    >
                      <Download size={15} />
                      Export report
                    </Button>
                  </div>
                </div>
                {ticket.incident ? (
                  <>
                    <IncidentWorkspace
                      key={ticket.id}
                      ticket={ticket}
                      busy={busy}
                      work={work}
                    />
                    <AIInvestigationPanel
                      ticket={ticket}
                      busy={busy}
                      onResult={(updated) => {
                        setTickets((all) =>
                          all.map((t) => (t.id === updated.id ? updated : t)),
                        );
                        setMessage('AI investigation saved.');
                      }}
                    />
                  </>
                ) : (
                  <SimulationWorkspace
                    ticket={ticket}
                    busy={busy}
                    change={(op) => void change(ticket, op).catch(() => {})}
                  />
                )}
              </>
            ) : (
              <div className="empty-workspace">
                <Activity size={34} />
                <h2>
                  {loading
                    ? 'Loading your workspace…'
                    : 'Start with an incident'}
                </h2>
                <p>
                  Create a reported incident with your own evidence, or open a
                  log example from the library to try the investigation
                  workflow.
                </p>
                <div className="plan-actions">
                  <Button className="primary-button" onClick={openNew}>
                    Create incident
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLibraryOpen(true)}
                  >
                    Browse 10 log examples
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
        <footer>
          <span>ResolveAI · Evidence, work notes, and verification</span>
          <span>Saved to your account · AI-assisted investigation</span>
        </footer>
        <output className="sr-only" aria-live="polite">
          {message}
        </output>
      </main>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="ticket-dialog">
          <DialogHeader>
            <DialogTitle>
              {draft.source === 'example'
                ? 'Create log example'
                : 'Report an incident'}
            </DialogTitle>
            <DialogDescription>
              {draft.source === 'example'
                ? 'This record uses synthetic example logs and stays labeled as an example.'
                : 'Describe the issue and add relevant evidence. This creates a real work record; it does not invent device readings.'}
            </DialogDescription>
          </DialogHeader>
          <form className="ticket-form" onSubmit={submit}>
            <label htmlFor="title">Issue title</label>
            <Input
              id="title"
              value={draft.title}
              minLength={5}
              maxLength={120}
              required
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <label htmlFor="description">Symptoms and impact</label>
            <Textarea
              id="description"
              value={draft.description}
              maxLength={1500}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="What failed, who is affected, and when did it start?"
            />
            <div className="form-grid">
              <Choice
                label="Priority"
                value={draft.priority}
                options={priorityLabel}
                onChange={(v) => setDraft({ ...draft, priority: v })}
              />
              <Choice
                label="Category"
                value={draft.category}
                options={categoryLabel}
                onChange={(v) => setDraft({ ...draft, category: v })}
              />
            </div>
            <label htmlFor="asset">Affected asset / service</label>
            <Input
              id="asset"
              value={draft.asset}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, asset: e.target.value })}
            />
            <label htmlFor="evidence">Log excerpt (optional)</label>
            <Textarea
              id="evidence"
              className="log-editor"
              value={draft.evidence}
              maxLength={6000}
              onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
              placeholder="Remove secrets before saving. You can add or import logs later."
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="primary-button">
              {busy ? 'Saving…' : 'Create incident'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="library-dialog">
          <DialogHeader>
            <DialogTitle>Incident library</DialogTitle>
            <DialogDescription>
              Ten log-based cases across software, IT, and embedded systems.
              Each opens an editable example with a distinct error signature.
            </DialogDescription>
          </DialogHeader>
          <div className="library-grid">
            {guides.map((g) => (
              <button
                key={g.id}
                className="library-card"
                onClick={() => {
                  setDraft({
                    ...blank,
                    title: g.title,
                    description:
                      'Example incident for practicing evidence-based investigation. Replace or extend the supplied logs as you work.',
                    category: g.category,
                    source: 'example',
                    evidence: g.example,
                  });
                  setLibraryOpen(false);
                  setNewOpen(true);
                  setError('');
                }}
              >
                <span>{categoryLabel[g.category]}</span>
                <h3>{g.title}</h3>
                <p>Inspect evidence → follow checks → record verification</p>
              </button>
            ))}
          </div>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() =>
              void run(async () => {
                const d = await api('/api/tickets/seed', {});
                setTickets(d.tickets);
                setSelected('INC-001');
                setFilter('all');
                setSourceFilter('all');
                setSearch('');
                setLibraryOpen(false);
              }).catch(() => {})
            }
          >
            Load the 3 original device simulations
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
