export async function submitRequest(req, fetcher = fetch) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 2048)
      return {
        status: 413,
        message: 'Keep your request under 120 characters.',
      };
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return { status: 400, message: 'Enter a request before submitting.' };
  }
  const title = input?.title;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120)
    return { status: 400, message: 'Enter a request of 1–120 characters.' };
  const id = crypto.randomUUID();
  try {
    const r = await fetcher('http://127.0.0.1:4319/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, value: 'User request: ' + title.trim() }),
      signal: AbortSignal.timeout(1000),
    });
    const data = await r.json();
    if (r.status === 201 && data.record?.id === id)
      return {
        status: 201,
        message:
          'Saved. Your request was written to the database and read back successfully.',
        record: data.record,
      };
    return {
      status: 503,
      message: /readonly|read.only/i.test(data.error || '')
        ? 'Couldn’t save. The database is refusing writes even though the website is online. Restore normal operation, then submit again.'
        : 'The service could not save your request. Check the monitor below, restore the service, and try again.',
    };
  } catch (e) {
    return {
      status: 503,
      message:
        e.name === 'TimeoutError'
          ? 'No save confirmation arrived within one second. Check your saved requests before retrying; the monitor below will investigate repeated failures.'
          : 'The saving service is unreachable. Restart the service, then try again.',
    };
  }
}
