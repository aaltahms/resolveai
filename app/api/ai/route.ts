import { env } from 'cloudflare:workers';
import { database } from '@/lib/database';
import { identity, json, failure } from '@/lib/api';
import { aiBudget, AI_MODEL } from '@/lib/ai';
export async function GET(request: Request) {
  try {
    identity(request);
    return json({
      configured: !!(env as unknown as { OPENAI_API_KEY?: string })
        .OPENAI_API_KEY,
      model: AI_MODEL,
      ...(await aiBudget(database())),
    });
  } catch (e) {
    return failure(e);
  }
}
