// Client-driven sync engine (spec §11.1/§11.5/§11.6). One total order per
// notebook via sync_ops.server_seq; devices push unsynced local ops, pull the
// tail after their cursor, and apply foreign ops with LWW rules.
import * as db from '../db';
import { deviceId, uid } from '../ids';
import { cloudConfigured, currentUser, supabase } from '../cloud/supabase';
import { applyOp } from './ops';
import type { SyncOp } from './ops';

export interface SyncStatus {
  state: 'disabled' | 'idle' | 'syncing' | 'error';
  lastSyncAt: number | null;
  error?: string;
}

export interface BlobHooks {
  afterPush(notebookIds: string[]): Promise<void>;
  afterApply(applied: SyncOp[]): Promise<void>;
  maybeSnapshot(notebookIds: string[]): Promise<void>;
  /** Fast-path install for a notebook this device has never seen; returns the
   *  snapshot's watermark server_seq (0 = no snapshot, replay everything). */
  bootstrapNotebook(notebookId: string): Promise<number>;
}

let hooks: BlobHooks = {
  afterPush: async () => {},
  afterApply: async () => {},
  maybeSnapshot: async () => {},
  bootstrapNotebook: async () => 0,
};

export function setBlobHooks(h: BlobHooks): void {
  hooks = h;
}

let status: SyncStatus = { state: 'disabled', lastSyncAt: null };
const listeners = new Set<(s: SyncStatus) => void>();

function setStatus(next: Partial<SyncStatus>): void {
  status = { ...status, ...next };
  listeners.forEach((l) => l(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  cb(status);
  return () => {
    listeners.delete(cb);
  };
}

const PUSH_BATCH = 500;
const PULL_BATCH = 1000;
const PRUNE_AGE_MS = 7 * 24 * 3600 * 1000;

type CursorMap = Record<string, number>;

async function cursors(): Promise<CursorMap> {
  return (await db.getSetting<CursorMap>('syncCursors')) ?? {};
}

async function setCursor(notebookId: string, seq: number): Promise<void> {
  const map = await cursors();
  map[notebookId] = seq;
  await db.setSetting('syncCursors', map);
}

async function enqueueBackfillOp(
  notebookId: string,
  type: SyncOp['type'],
  payload: unknown,
  ts: number
): Promise<void> {
  await db.appendOpDirect({ opId: uid(), deviceId: deviceId(), notebookId, type, payload, ts, synced: 0 });
}

/** Emit ops for everything local exactly once (data predating sync/capture). */
async function backfillIfNeeded(): Promise<void> {
  const done = await db.getSetting<boolean>('oplogBackfillDone');
  if (done === true) return;
  if (done === false || (await db.listAllOps()).length === 0) {
    for (const nb of await db.listNotebooks()) {
      await enqueueBackfillOp(nb.id, 'UPSERT_NOTEBOOK', { notebook: nb }, nb.updatedAt);
      for (const p of await db.listPagesIncludingDeleted(nb.id)) {
        await enqueueBackfillOp(nb.id, 'UPSERT_PAGE', { page: p }, p.updatedAt);
        for (const s of await db.listStrokes(p.id)) {
          await enqueueBackfillOp(nb.id, 'PUT_STROKE', { stroke: s }, s.createdAt);
        }
        for (const r of await db.listRecognitionByPage(p.id)) {
          await enqueueBackfillOp(nb.id, 'PUT_RECOGNITION', { record: r }, r.timestamp);
        }
      }
      for (const f of await db.listFeedback(nb.id)) {
        await enqueueBackfillOp(nb.id, 'ADD_FEEDBACK', { feedback: f }, f.createdAt);
      }
    }
  }
  await db.setSetting('oplogBackfillDone', true);
}

async function pushOnce(userId: string): Promise<string[]> {
  const touched = new Set<string>();
  for (;;) {
    const batch = await db.listUnsyncedOps(PUSH_BATCH);
    if (batch.length === 0) break;
    const nbIds = [...new Set(batch.map((o) => o.notebookId))];
    const titles = new Map<string, string>();
    for (const id of nbIds) {
      const nb = await db.getNotebookIncludingDeleted(id);
      titles.set(id, nb?.title ?? '');
    }
    const { error: regErr } = await supabase()
      .from('notebook_sync')
      .upsert(nbIds.map((id) => ({ notebook_id: id, owner_id: userId, title: titles.get(id) ?? '' })));
    if (regErr) throw regErr;
    const { error: memErr } = await supabase()
      .from('notebook_members')
      .upsert(nbIds.map((id) => ({ notebook_id: id, user_id: userId, role: 'owner' })));
    if (memErr) throw memErr;
    const rows = batch.map((o) => ({
      notebook_id: o.notebookId,
      op_id: o.opId,
      author_id: userId,
      device_id: o.deviceId,
      op_type: o.type,
      payload: o.payload,
      client_ts: o.ts,
    }));
    const { error } = await supabase().from('sync_ops').insert(rows);
    // a retried push may hit the unique op_id constraint — that means the ops
    // are already on the server, which is success for our purposes
    if (error && !/duplicate|unique/i.test(error.message ?? '')) throw error;
    await db.markOpsSynced(batch.map((o) => o.opId));
    nbIds.forEach((id) => touched.add(id));
    if (batch.length < PUSH_BATCH) break;
  }
  return [...touched];
}

export type NotebookRole = 'owner' | 'editor' | 'viewer';

async function memberships(userId: string): Promise<{ id: string; role: NotebookRole }[]> {
  const { data, error } = await supabase()
    .from('notebook_members')
    .select('notebook_id, role')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { notebook_id: string; role: string }) => ({
    id: r.notebook_id,
    role: r.role as NotebookRole,
  }));
}

/** Role this account holds on a notebook; local-only notebooks are 'owner'. */
export async function roleFor(notebookId: string): Promise<NotebookRole> {
  const roles = (await db.getSetting<Record<string, NotebookRole>>('notebookRoles')) ?? {};
  return roles[notebookId] ?? 'owner';
}

async function pullNotebook(notebookId: string): Promise<SyncOp[]> {
  const map = await cursors();
  let cursor = map[notebookId] ?? 0;
  if (cursor === 0 && !(await db.getNotebookIncludingDeleted(notebookId))) {
    cursor = await hooks.bootstrapNotebook(notebookId); // snapshot fast-path
  }
  const applied: SyncOp[] = [];
  const me = deviceId();
  for (;;) {
    const { data, error } = await supabase()
      .from('sync_ops')
      .select()
      .eq('notebook_id', notebookId)
      .gt('server_seq', cursor)
      .order('server_seq', { ascending: true })
      .limit(PULL_BATCH);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      cursor = r.server_seq as number;
      if (r.device_id === me) continue; // echo of our own op
      const op: SyncOp = {
        opId: r.op_id,
        deviceId: r.device_id,
        notebookId: r.notebook_id,
        type: r.op_type as SyncOp['type'],
        payload: r.payload,
        ts: r.client_ts as number,
        synced: 1,
      };
      await applyOp(op);
      applied.push(op);
    }
    if (rows.length < PULL_BATCH) break;
  }
  await setCursor(notebookId, cursor);
  return applied;
}

let syncing: Promise<SyncStatus> | null = null;

export function syncNow(): Promise<SyncStatus> {
  if (syncing) return syncing;
  syncing = doSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(): Promise<SyncStatus> {
  if (!cloudConfigured()) {
    setStatus({ state: 'disabled' });
    return status;
  }
  const user = await currentUser();
  if (!user) {
    setStatus({ state: 'disabled' });
    return status;
  }
  const settings = (await db.getSetting<{ cloudSync?: boolean }>('settings')) ?? {};
  if (settings.cloudSync === false) {
    setStatus({ state: 'disabled' });
    return status;
  }
  setStatus({ state: 'syncing', error: undefined });
  try {
    await backfillIfNeeded();
    const pushedNbs = await pushOnce(user.id);
    await hooks.afterPush(pushedNbs);
    const members = await memberships(user.id);
    await db.setSetting('notebookRoles', Object.fromEntries(members.map((m) => [m.id, m.role])));
    const nbIds = members.map((m) => m.id);
    const applied: SyncOp[] = [];
    for (const id of nbIds) applied.push(...(await pullNotebook(id)));
    await hooks.afterApply(applied);
    await hooks.maybeSnapshot(nbIds);
    await db.pruneSyncedOpsBefore(Date.now() - PRUNE_AGE_MS);
    setStatus({ state: 'idle', lastSyncAt: Date.now() });
  } catch (err) {
    setStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) });
  }
  return status;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Call after local mutations; schedules a sync ~10 s later. */
export function noteLocalMutation(): void {
  if (!cloudConfigured()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void syncNow();
  }, 10_000);
}

export function startSyncTriggers(): () => void {
  const onOnline = () => {
    void syncNow();
  };
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
  void syncNow();
  return () => {
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

/** Test hook: clear module state between cases. */
export async function _resetForTests(): Promise<void> {
  status = { state: 'disabled', lastSyncAt: null };
  await db.setSetting('syncCursors', {});
  await db.setSetting('oplogBackfillDone', true);
}
