import { ApiError, type SavedTicket } from './ticket-store.ts';
import { newIncident } from './incidents.ts';
export type CollectorEvent = {
  episode: string;
  channel?: 'chrome';
  phase: 'outage' | 'recovery';
  title?: string;
  description?: string;
  evidence: string;
};
export function validateCollectorEvent(
  body: Record<string, unknown>,
): CollectorEvent {
  if (
    Object.keys(body).some(
      (k) =>
        ![
          'episode',
          'phase',
          'title',
          'description',
          'evidence',
          'channel',
        ].includes(k),
    ) ||
    typeof body.episode !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.episode,
    ) ||
    !['outage', 'recovery'].includes(body.phase as string) ||
    typeof body.evidence !== 'string' ||
    !body.evidence.trim() ||
    body.evidence.length > 6000
  )
    throw new ApiError(400, 'Invalid collector event.');
  if (body.channel !== undefined && body.channel !== 'chrome')
    throw new ApiError(400, 'Invalid collector channel.');
  if (body.channel === 'chrome' && body.phase !== 'outage')
    throw new ApiError(400, 'Chrome reports do not verify recovery.');
  if (
    body.phase === 'outage' &&
    (typeof body.title !== 'string' ||
      body.title.length < 5 ||
      body.title.length > 120 ||
      typeof body.description !== 'string' ||
      body.description.length > 1500)
  )
    throw new ApiError(400, 'Invalid incident brief.');
  if (
    body.phase === 'recovery' &&
    (body.title !== undefined || body.description !== undefined)
  )
    throw new ApiError(400, 'Recovery only accepts evidence.');
  return body as CollectorEvent;
}
type Collected = SavedTicket & {
  collector: { creation: string; recovery?: string };
};
export async function deliverCollectorEvent(
  db: D1Database,
  owner: string,
  event: CollectorEvent,
) {
  const id = (event.channel === 'chrome' ? 'CHR-' : 'INV-') + event.episode,
    signature = JSON.stringify({
      title: event.title,
      description: event.description,
      evidence: event.evidence,
    });
  if (event.phase === 'outage') {
    const at = new Date().toISOString();
    const ticket = {
      ...newIncident(
        id,
        event.title!,
        event.description!,
        {
          source: 'reported',
          priority: 'P2',
          asset:
            event.channel === 'chrome'
              ? 'Chrome local-page capture'
              : 'Independent inventory API',
          evidence: event.evidence,
        },
        'application',
        at,
      ),
      collector: { creation: signature },
    };
    await db
      .prepare(
        'INSERT INTO tickets(owner_id,id,payload,revision,created_at) SELECT ?,?,?,1,? WHERE (SELECT COUNT(*) FROM tickets WHERE owner_id=?) < 497 ON CONFLICT DO NOTHING',
      )
      .bind(owner, id, JSON.stringify(ticket), at, owner)
      .run();
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db
      .prepare('SELECT payload,revision FROM tickets WHERE owner_id=? AND id=?')
      .bind(owner, id)
      .first<{ payload: string; revision: number }>();
    if (!row)
      throw new ApiError(
        409,
        event.phase === 'outage'
          ? 'Incident limit reached.'
          : 'Deliver the outage before recovery.',
      );
    const t = {
      ...JSON.parse(row.payload),
      revision: row.revision,
    } as Collected;
    if (!t.collector) throw new ApiError(409, 'Incident identifier conflict.');
    if (event.phase === 'outage') {
      if (t.collector.creation !== signature)
        throw new ApiError(
          409,
          'This episode was already created with different evidence.',
        );
      return t;
    }
    if (t.collector.recovery !== undefined) {
      if (t.collector.recovery !== signature)
        throw new ApiError(
          409,
          'Recovery already recorded with different evidence.',
        );
      return t;
    }
    if (t.events.length >= 250)
      throw new ApiError(409, 'Incident activity limit reached.');
    t.collector.recovery = signature;
    t.events.push({
      at: new Date().toISOString(),
      title: 'Inventory recovery verified',
      detail:
        'Collector observed three successful create and independent read-back checks.\n' +
        event.evidence,
    });
    const result = await db
      .prepare(
        'UPDATE tickets SET payload=?, revision=revision+1 WHERE owner_id=? AND id=? AND revision=?',
      )
      .bind(JSON.stringify(t), owner, id, row.revision)
      .run();
    if (result.meta.changes === 1) return { ...t, revision: row.revision + 1 };
  }
  throw new ApiError(
    409,
    'Incident changed concurrently. Retry the same event.',
  );
}
