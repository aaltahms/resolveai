// Transparent rules over observed evidence. No AI calls or fault-control inputs.
export function incidentBrief(samples) {
  const recent = samples.slice(0, 3);
  const all = (predicate) =>
    recent.length === 3 && recent.every((s) => !s.ok && predicate(s));
  const trace = (s) =>
    (s.trace || []).filter((t) => t.requestId === s.requestId);
  let title = 'Saving requests failed; cause not established';
  let confirmed =
    'Repeated functional checks failed. The available evidence does not consistently locate the failure.';
  let next =
    'Inspect the correlated requests and collect any missing application and database events before choosing a fix.';
  let unknown =
    'The underlying cause and effect on other users are not established.';
  let classification = 'unknown';
  if (
    all((s) =>
      trace(s).some(
        (t) =>
          t.stage === 'database' &&
          t.status === 'failed' &&
          t.queryOnly === true,
      ),
    )
  ) {
    classification = 'database_read_only';
    title = 'Database read-only mode is blocking saves';
    confirmed =
      'Database operations failed while SQLite query_only was enabled in each observed request.';
    next =
      'Check how the application opened or configured its database connection. After correcting the setting, verify a fresh write and read-back.';
    unknown =
      'The evidence does not establish who or what enabled read-only mode. Filesystem permissions have not been diagnosed.';
  } else if (
    all((s) =>
      trace(s).some(
        (t) =>
          t.stage === 'database' &&
          t.status === 'failed' &&
          /database is locked/i.test(t.error || '') &&
          t.queryOnly === false,
      ),
    )
  ) {
    classification = 'database_locked';
    title = 'Database lock contention is blocking saves';
    confirmed =
      'Database writes encountered a lock while SQLite query_only was disabled in each observed request.';
    next =
      'Inspect active transactions and concurrent writers for a transaction that has not completed. Verify a fresh write and read-back after the lock is released.';
    unknown =
      'The collected evidence does not identify the lock owner or justify terminating a process or deleting database files.';
  } else if (
    all(
      (s) =>
        /TimeoutError/.test(s.detail) &&
        trace(s).some(
          (t) => t.stage === 'application' && t.status === 'started',
        ) &&
        !trace(s).some(
          (t) =>
            t.stage === 'database_write' ||
            (t.stage === 'application' && t.status === 'completed'),
        ),
    )
  ) {
    classification = 'application_wait';
    title = 'Save requests time out before a database write is observed';
    confirmed =
      'Application processing started, but no completion or database-write event was captured before the client deadline.';
    next =
      'Inspect work or waits before the database call. Collect application timing or a profile before blaming the database.';
    unknown =
      'The specific slow operation is unknown. Missing events alone do not prove that the database is healthy or that a write never occurred later.';
  } else if (
    all(
      (s) =>
        s.detail.startsWith('health ECONNREFUSED') && trace(s).length === 0,
    )
  ) {
    classification = 'unreachable';
    title = 'The saving service is refusing connections';
    confirmed =
      'The health endpoint refused each connection; no application trace was captured.';
    next =
      'Check that the service is running and listening at the configured address, then retry a write and read-back.';
    unknown =
      'A refused connection does not establish why the process stopped or whether the configured address is correct.';
  }
  const refs = recent.map((s) => s.requestId).filter(Boolean);
  return {
    classification,
    title,
    description: `Impact: automated save checks failed in the local lab; submitted requests may also be affected.\n\nObserved: ${confirmed}\n\nNext check: ${next}\n\nNot established: ${unknown}\n\nBasis: ${refs.join(', ')}. Rule-based triage; review against the attached evidence.`,
  };
}
