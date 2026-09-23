import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from 'drizzle-orm/sqlite-core';
export const tickets = sqliteTable(
  'tickets',
  {
    ownerId: text('owner_id').notNull(),
    id: text('id').notNull(),
    payload: text('payload').notNull(),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index('idx_tickets_owner_created').on(table.ownerId, table.createdAt),
  ],
);
export const aiBudget = sqliteTable('ai_budget', {
  id: text('id').primaryKey(),
  reservedCents: integer('reserved_cents').notNull().default(0),
});
export const aiAttempts = sqliteTable(
  'ai_attempts',
  {
    ownerId: text('owner_id').notNull(),
    ticketId: text('ticket_id').notNull(),
    ticketRevision: integer('ticket_revision').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.ticketId, table.ticketRevision],
    }),
  ],
);
