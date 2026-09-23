import { database } from '@/lib/database';
import { transitionTicket, ApiError } from '@/lib/ticket-store';
import { identity, verifyWrite, readBody, json, failure } from '@/lib/api';
import { keys, validDetails } from '@/lib/incident-validation';
import type { WorkOperation } from '@/lib/incidents';
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = identity(request);
    verifyWrite(request);
    const body = await readBody(request, 32768);
    const op = body.operation;
    if (
      typeof op !== 'string' ||
      ![
        'evidence',
        'analyze',
        'comment',
        'resolve',
        'reopen',
        'escalate',
        'details',
      ].includes(op) ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 1
    )
      throw new ApiError(400, 'Supply a valid operation and current revision.');
    keys(body, [
      'operation',
      'revision',
      ...(op === 'details'
        ? ['priority', 'category', 'asset']
        : op === 'analyze'
          ? []
          : ['text']),
    ]);
    if (op === 'details') validDetails(body);
    else if (
      op !== 'analyze' &&
      (typeof body.text !== 'string' ||
        body.text.length > (op === 'evidence' ? 6000 : 2000))
    )
      throw new ApiError(
        400,
        op === 'evidence'
          ? 'Evidence must be text under 6,000 characters.'
          : 'Notes must be text under 2,000 characters.',
      );
    const { id } = await context.params;
    return json({
      ticket: await transitionTicket(
        database(),
        owner,
        id,
        op as WorkOperation,
        body.revision as number,
        body,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
