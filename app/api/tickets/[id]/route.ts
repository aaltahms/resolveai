import { database } from '@/lib/database';
import { transitionTicket, ApiError } from '@/lib/ticket-store';
import { identity, verifyWrite, readBody, json, failure } from '@/lib/api';
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = identity(request);
    verifyWrite(request);
    const { id } = await context.params;
    const body = await readBody(request);
    if (
      Object.keys(body).some((k) => !['operation', 'revision'].includes(k)) ||
      !['diagnose', 'approve', 'decline'].includes(String(body.operation)) ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 1
    )
      throw new ApiError(400, 'Supply a valid operation and current revision.');
    return json({
      ticket: await transitionTicket(
        database(),
        owner,
        id,
        body.operation as 'diagnose' | 'approve' | 'decline',
        body.revision as number,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
