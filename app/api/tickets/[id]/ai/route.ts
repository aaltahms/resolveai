import { env } from 'cloudflare:workers';
import { database } from '@/lib/database';
import { identity, verifyWrite, readBody, json, failure } from '@/lib/api';
import { ApiError } from '@/lib/ticket-store';
import { investigateAI } from '@/lib/ai';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = identity(request);
    verifyWrite(request);
    const body = await readBody(request);
    if (
      Object.keys(body).some((k) => k !== 'revision') ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 1
    )
      throw new ApiError(400, 'Supply the current incident revision only.');
    const { id } = await context.params;
    const key =
      (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY ?? '';
    return json({
      ticket: await investigateAI(
        database(),
        owner,
        id,
        body.revision as number,
        key,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
