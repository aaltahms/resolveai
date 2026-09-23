import { database } from '@/lib/database';
import { identity, verifyWrite, readBody, json, failure } from '@/lib/api';
import {
  validateCollectorEvent,
  deliverCollectorEvent,
} from '@/lib/collector-store';
export async function POST(request: Request) {
  try {
    const owner = identity(request);
    verifyWrite(request);
    const event = validateCollectorEvent(await readBody(request, 32768));
    return json({
      ticket: await deliverCollectorEvent(database(), owner, event),
    });
  } catch (e) {
    return failure(e);
  }
}
