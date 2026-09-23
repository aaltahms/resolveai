'use client';
import { useEffect, useRef } from 'react';
import type { SavedTicket } from './ticket-store';
type Session = {
  tickets: SavedTicket[];
  investigate: (id: string) => Promise<SavedTicket>;
};
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an input object.');
  return value as Record<string, unknown>;
}
export function useLabTools(session: Session) {
  const current = useRef(session);
  useEffect(() => {
    current.current = session;
  });
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => console.warn('ResolveAI browser tools unavailable.'));
      } catch {
        console.warn('ResolveAI browser tools unavailable.');
      }
    };
    register({
      name: 'get_lab_incidents',
      description:
        'Read the current user’s loaded saved tickets and statuses. Does not change state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (Object.keys(inputObject(input)).length)
          throw new Error('No arguments expected.');
        return current.current.tickets.map(
          ({ id, title, status, category }) => ({
            id,
            title,
            status,
            category,
          }),
        );
      },
    });
    register({
      name: 'investigate_lab_incident',
      description:
        'Analyze the saved evidence on a reported incident or run legacy simulation diagnostics. Saves analysis, never approves a fix or executes device commands.',
      inputSchema: {
        type: 'object',
        properties: { ticketId: { type: 'string' } },
        required: ['ticketId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        const data = inputObject(input);
        if (Object.keys(data).length !== 1 || typeof data.ticketId !== 'string')
          throw new Error('Supply ticketId only.');
        if (!current.current.tickets.some((t) => t.id === data.ticketId))
          throw new Error('Ticket not found.');
        const result = await current.current.investigate(data.ticketId);
        return {
          id: result.id,
          status: result.status,
          findings: result.incident?.analysis ?? result.findings,
          proposedAction: result.plan?.title ?? null,
        };
      },
    });
    return () => lifecycle.abort();
  }, []);
}
