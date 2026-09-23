import { validDetails } from '@/lib/incident-validation';
import type { Category } from '@/lib/lab';
import type { Priority } from '@/lib/incidents';
import { database } from '@/lib/database';
import { addTicket, listTickets, ApiError } from '@/lib/ticket-store';
import { identity, verifyWrite, readBody, json, failure } from '@/lib/api';
export async function GET(request: Request) {
  try {
    const owner = identity(request);
    return json({ tickets: await listTickets(database(), owner) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const owner = identity(request);
    verifyWrite(request);
    const body = await readBody(request, 32768);
    if (
      Object.keys(body).some(
        (k) =>
          ![
            'title',
            'description',
            'source',
            'priority',
            'category',
            'asset',
            'evidence',
          ].includes(k),
      ) ||
      typeof body.title !== 'string' ||
      typeof body.description !== 'string'
    )
      throw new ApiError(400, 'Supply a title and description only.');
    if (
      body.title.trim().length < 5 ||
      body.title.trim().length > 120 ||
      body.description.trim().length > 1500
    )
      throw new ApiError(
        400,
        'Use a title of 5–120 characters and a description under 1,500 characters.',
      );
    const source = body.source ?? 'reported';
    if (
      typeof source !== 'string' ||
      !['reported', 'example', 'simulation'].includes(source)
    )
      throw new ApiError(400, 'Invalid incident source.');
    const details = {
      category: body.category ?? 'unknown',
      priority: body.priority ?? 'P3',
      asset: body.asset ?? '',
    };
    validDetails(details);
    if (
      body.evidence !== undefined &&
      (typeof body.evidence !== 'string' || body.evidence.length > 6000)
    )
      throw new ApiError(400, 'Evidence must be text under 6,000 characters.');
    return json(
      {
        ticket: await addTicket(
          database(),
          owner,
          body.title,
          body.description,
          source === 'simulation'
            ? undefined
            : {
                category: details.category as Category,
                data: {
                  source: source as 'reported' | 'example',
                  priority: details.priority as Priority,
                  asset: details.asset as string,
                  evidence: (body.evidence as string) || '',
                },
              },
        ),
      },
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
