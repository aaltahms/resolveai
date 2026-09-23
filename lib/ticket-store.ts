import {
  newIncident,
  workIncident,
  type IncidentData,
  type WorkOperation,
} from './incidents.ts';
import type { Category } from './lab.ts';
import {
  createTicket,
  initialTickets,
  diagnose,
  decide,
  type Ticket,
} from './lab.ts';
export type SavedTicket = Ticket & { revision: number };
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
type Row = { payload: string; revision: number };
function decode(row: Row): SavedTicket {
  return { ...(JSON.parse(row.payload) as Ticket), revision: row.revision };
}
export async function listTickets(
  db: D1Database,
  owner: string,
): Promise<SavedTicket[]> {
  const rows = await db
    .prepare(
      'SELECT payload, revision FROM tickets WHERE owner_id = ? ORDER BY created_at, id LIMIT 500',
    )
    .bind(owner)
    .all<Row>();
  return rows.results.map(decode);
}
export async function seedTickets(db: D1Database, owner: string) {
  const at = new Date().toISOString();
  const samples = initialTickets().map((t) =>
    createTicket(t.id, t.title, t.description, at),
  );
  await db.batch(
    samples.map((t) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO tickets (owner_id,id,payload,revision,created_at) VALUES (?,?,?,1,?)',
        )
        .bind(owner, t.id, JSON.stringify(t), at),
    ),
  );
  return listTickets(db, owner);
}
export async function addTicket(
  db: D1Database,
  owner: string,
  title: string,
  description: string,
  incident?: { data: IncidentData; category: Category },
): Promise<SavedTicket> {
  const at = new Date().toISOString();
  const id = `INC-${crypto.randomUUID()}`;
  const ticket = incident
    ? newIncident(id, title, description, incident.data, incident.category, at)
    : createTicket(id, title, description, at);
  // Bound each user's lab rather than silently hiding newly-created records past the list limit.
  const result = await db
    .prepare(
      'INSERT INTO tickets (owner_id,id,payload,revision,created_at) SELECT ?,?,?,1,? WHERE (SELECT COUNT(*) FROM tickets WHERE owner_id = ?) < 497',
    )
    .bind(owner, ticket.id, JSON.stringify(ticket), at, owner)
    .run();
  if (!result.meta.changes)
    throw new ApiError(409, 'This lab has reached its ticket limit.');
  return { ...ticket, revision: 1 };
}
export async function transitionTicket(
  db: D1Database,
  owner: string,
  id: string,
  operation: 'diagnose' | 'approve' | 'decline' | WorkOperation,
  revision: number,
  input: Record<string, unknown> = {},
): Promise<SavedTicket> {
  const row = await db
    .prepare(
      'SELECT payload,revision FROM tickets WHERE owner_id = ? AND id = ?',
    )
    .bind(owner, id)
    .first<Row>();
  if (!row) throw new ApiError(404, 'Ticket not found.');
  if (row.revision !== revision)
    throw new ApiError(
      409,
      'This ticket changed in another session. Refresh it before continuing.',
    );
  const current = decode(row);
  let updated: Ticket;
  try {
    updated =
      operation === 'diagnose'
        ? diagnose(current)
        : operation === 'approve' || operation === 'decline'
          ? decide(current, operation === 'approve')
          : workIncident(current, operation, input);
  } catch (e) {
    throw new ApiError(
      409,
      e instanceof Error ? e.message : 'Invalid ticket transition.',
    );
  }
  const result = await db
    .prepare(
      'UPDATE tickets SET payload = ?, revision = revision + 1 WHERE owner_id = ? AND id = ? AND revision = ?',
    )
    .bind(JSON.stringify(updated), owner, id, revision)
    .run();
  if (result.meta.changes !== 1)
    throw new ApiError(
      409,
      'Another session updated this ticket. Refresh it before continuing.',
    );
  return { ...updated, revision: revision + 1 };
}
