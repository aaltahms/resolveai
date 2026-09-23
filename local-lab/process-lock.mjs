import { DatabaseSync } from 'node:sqlite';
// OS-managed SQLite locking is released even when the owner is killed abruptly.
export function acquireProcessLock(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE');
  } catch {
    db.close();
    throw Error(
      'Another inventory monitor is using this state directory. Stop it before starting another.',
    );
  }
  return () => {
    db.exec('ROLLBACK');
    db.close();
  };
}
