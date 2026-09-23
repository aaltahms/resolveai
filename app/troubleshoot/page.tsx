'use client';
import { LocalNavigation } from '@/components/local-navigation';
import { useState } from 'react';
import Link from 'next/link';
import { playbooks } from '@/lib/troubleshooting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function Troubleshoot() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [symptom, setSymptom] = useState('');
  const [result, setResult] = useState('not-tried');
  const [verification, setVerification] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const book = playbooks.find((p) => p.id === selected);
  async function save() {
    if (!book || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: book.title,
          description: symptom,
          source: 'reported',
          category: book.category,
          priority: 'P3',
          asset: book.platform,
          evidence: [
            'Guided troubleshooting — user-reported observations; no device scan or automatic repair.',
            ...book.checks.map(
              (check, i) =>
                `${check}\nObservation: ${answers[i] || 'Not checked'}`,
            ),
            `Suggested next step: ${book.fix}`,
            `Verification: ${book.verify}`,
            `User-reported outcome: ${result}`,
            `Verification observation: ${verification || 'Not recorded'}`,
            `Reference: ${book.source}`,
          ].join('\n\n'),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        ticket: { id: string };
      };
      if (!response.ok)
        throw Error(data.error || 'Could not save the investigation.');
      window.location.assign(
        '/?incident=' + encodeURIComponent(data.ticket.id),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }
  return (
    <main
      className="main"
      style={{ maxWidth: 1000, margin: 'auto', padding: '32px 20px' }}
    >
      <LocalNavigation current="procedures" />
      <h1 style={{ fontSize: '2rem', marginTop: 24 }}>What’s wrong?</h1>
      <p>
        Choose a problem, record the checks, and work toward a verified fix.
      </p>
      <p className="field-help">
        These procedures use observations you record yourself; they do not scan
        a device or apply repairs. Save the investigation to keep your evidence
        and work notes in the incident desk.
      </p>
      {!book ? (
        <>
          <label htmlFor="find-problem">
            Find a problem · {playbooks.length} guides
          </label>
          <Input
            id="find-problem"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Printer, internet, sound, storage, database…"
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 270px), 1fr))',
              gap: 12,
              marginTop: 20,
            }}
          >
            {playbooks
              .filter((p) =>
                `${p.title} ${p.platform} ${p.category}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelected(p.id);
                    setAnswers({});
                    setSymptom('');
                    setError('');
                    setResult('not-tried');
                    setVerification('');
                  }}
                  style={{
                    textAlign: 'left',
                    padding: 20,
                    border: '1px solid #ccd6e1',
                    borderRadius: 12,
                    background: 'white',
                    color: '#172b46',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ fontSize: 16 }}>{p.title}</strong>
                  <p>{p.platform}</p>
                </button>
              ))}
          </div>
          <p>
            No matching guide?{' '}
            <Link href="/">
              Create an incident with the symptoms and exact error.
            </Link>
          </p>
        </>
      ) : (
        <section style={{ marginTop: 24 }}>
          <Button variant="outline" onClick={() => setSelected('')}>
            Choose another problem
          </Button>
          <h2 style={{ marginTop: 20, fontSize: 24 }}>{book.title}</h2>
          <p>{book.meaning}</p>
          <label htmlFor="symptoms">What happened on your device?</label>
          <Textarea
            id="symptoms"
            maxLength={1500}
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="Describe the failed action, device, and exact error. Omit passwords and private information."
          />
          <h3 style={{ marginTop: 24 }}>Check before changing anything</h3>
          {book.checks.map((check, i) => (
            <div key={check} style={{ margin: '16px 0' }}>
              <label htmlFor={`check-${i}`}>
                {i + 1}. {check}
              </label>
              <Input
                id={`check-${i}`}
                maxLength={250}
                value={answers[i] || ''}
                onChange={(e) =>
                  setAnswers({ ...answers, [i]: e.target.value })
                }
                placeholder="What did you observe? Leave blank if not checked."
              />
            </div>
          ))}
          <h3>Suggested fix / next step</h3>
          <p>{book.fix}</p>
          <p>
            <a href={book.source} target="_blank" rel="noreferrer">
              Read the vendor reference ↗
            </a>
          </p>
          <h3 style={{ marginTop: 24 }}>Did the original task work?</h3>
          <p>{book.verify}</p>
          <label htmlFor="outcome">Your result</label>
          <select
            id="outcome"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            style={{
              display: 'block',
              padding: 12,
              margin: '8px 0',
              fontSize: 16,
            }}
          >
            <option value="not-tried">Not tested yet</option>
            <option value="still-failing">Still failing</option>
            <option value="user-reported-success">
              I repeated the task and it worked
            </option>
          </select>
          <label htmlFor="verification">
            What happened when you tried again?
          </label>
          <Textarea
            id="verification"
            value={verification}
            maxLength={500}
            onChange={(e) => setVerification(e.target.value)}
          />
          <p>
            This records your result. It does not automatically close the
            incident or claim that the device was independently verified.
          </p>
          <Button
            disabled={
              saving ||
              !symptom.trim() ||
              (result === 'user-reported-success' && !verification.trim())
            }
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save investigation'}
          </Button>
          {error && <p role="alert">{error}</p>}
        </section>
      )}
    </main>
  );
}
