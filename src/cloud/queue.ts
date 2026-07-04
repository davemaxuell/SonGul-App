// Auto-backups that failed (offline, server hiccup) wait here and retry
// when the library loads or connectivity returns.
import * as db from '../db';

const KEY = 'pendingBackups';

export async function pendingBackups(): Promise<string[]> {
  return (await db.getSetting<string[]>(KEY)) ?? [];
}

export async function queueBackup(notebookId: string): Promise<void> {
  const cur = await pendingBackups();
  if (!cur.includes(notebookId)) await db.setSetting(KEY, [...cur, notebookId]);
}

export async function flushPending(run: (notebookId: string) => Promise<void>): Promise<number> {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) return 0;
  const cur = await pendingBackups();
  if (cur.length === 0) return 0;
  let done = 0;
  const remaining: string[] = [];
  for (const id of cur) {
    try {
      await run(id);
      done++;
    } catch {
      remaining.push(id);
    }
  }
  await db.setSetting(KEY, remaining);
  return done;
}
