import { ApiError } from './ticket-store.ts';
export function identity(request: Request): string {
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner)
    throw new ApiError(
      401,
      'Sign in to your private ResolveAI site to continue.',
    );
  return owner;
}
export function verifyWrite(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new ApiError(403, 'This request must come from your ResolveAI site.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new ApiError(403, 'Cross-site writes are not allowed.');
}
export async function readBody(
  request: Request,
  maxBytes = 8192,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new ApiError(415, 'Send JSON data.');
  // Stream the body with a byte limit instead of trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Request body is required.');
  let text = '',
    size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'Request is too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    const result = JSON.parse(text);
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error();
    return result;
  } catch {
    throw new ApiError(400, 'Invalid JSON object.');
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message }, error.status);
  console.error(
    'ResolveAI API operation failed',
    error instanceof Error ? error.message : 'Unknown error',
  );
  return json({ error: 'Could not save this change. Please retry.' }, 500);
}
