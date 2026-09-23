import { database } from '@/lib/database';
import { seedTickets, ApiError } from '@/lib/ticket-store';
import { identity, verifyWrite, readBody, json, failure } from '@/lib/api';
export async function POST(request: Request) {
  try {
    const owner = identity(request);
    verifyWrite(request);
    const body = await readBody(request);
    if (Object.keys(body).length)
      throw new ApiError(400, 'No arguments expected.');
    return json({ tickets: await seedTickets(database(), owner) });
  } catch (e) {
    return failure(e);
  }
}
