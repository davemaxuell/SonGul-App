// Local-first storage layer (IndexedDB). Strokes are written individually the
// moment they are committed, which doubles as crash recovery: reopening the
// app replays everything that reached the store.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Attachment,
  FeedbackResult,
  Notebook,
  Page,
  RecognitionRecord,
  Stroke,
  TemplateId,
} from './types';
import { PAGE_H, PAGE_W } from './types';
import { deviceId, uid } from './ids';
import { cloudConfigured } from './cloud/supabase';
import type { SyncOp, SyncOpType } from './sync/ops';

interface SongulDB extends DBSchema {
  notebooks: { key: string; value: Notebook };
  pages: { key: string; value: Page; indexes: { 'by-notebook': string } };
  strokes: { key: string; value: Stroke; indexes: { 'by-page': string } };
  attachments: { key: string; value: Attachment };
  pageImages: { key: string; value: { pageId: string; blob: Blob } };
  feedback: { key: string; value: FeedbackResult; indexes: { 'by-notebook': string } };
  settings: { key: string; value: { key: string; value: unknown } };
  recognition_results: {
    key: string;
    value: RecognitionRecord;
    indexes: { 'by-page': string };
  };
  oplog: {
    key: number;
    value: SyncOp;
    indexes: { 'by-synced': number; 'by-opid': string };
  };
}

let dbPromise: Promise<IDBPDatabase<SongulDB>> | null = null;

function db(): Promise<IDBPDatabase<SongulDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SongulDB>('songul-note', 3, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('notebooks', { keyPath: 'id' });
          const pages = d.createObjectStore('pages', { keyPath: 'id' });
          pages.createIndex('by-notebook', 'notebookId');
          const strokes = d.createObjectStore('strokes', { keyPath: 'id' });
          strokes.createIndex('by-page', 'pageId');
          d.createObjectStore('attachments', { keyPath: 'id' });
          d.createObjectStore('pageImages', { keyPath: 'pageId' });
          const fb = d.createObjectStore('feedback', { keyPath: 'id' });
          fb.createIndex('by-notebook', 'notebookId');
          d.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          const rec = d.createObjectStore('recognition_results', { keyPath: 'key' });
          rec.createIndex('by-page', 'pageId');
        }
        if (oldVersion < 3) {
          const ops = d.createObjectStore('oplog', { autoIncrement: true });
          ops.createIndex('by-synced', 'synced');
          ops.createIndex('by-opid', 'opId', { unique: true });
        }
      },
    });
  }
  return dbPromise;
}

// ---- sync op capture -------------------------------------------------------
// Every mutation appends an op when cloud is configured. The sync applier and
// snapshot installer run inside withoutOpCapture() so replicated state never
// re-emits ops. pageId→notebookId is cached to keep stroke ops cheap.

let captureSuspended = 0;
const pageNotebook = new Map<string, string>();

export async function withoutOpCapture<T>(fn: () => Promise<T>): Promise<T> {
  captureSuspended++;
  try {
    return await fn();
  } finally {
    captureSuspended--;
  }
}

async function appendOp(
  notebookId: string,
  type: SyncOpType,
  payload: unknown,
  ts: number
): Promise<void> {
  if (captureSuspended > 0 || !cloudConfigured()) return;
  const op: SyncOp = { opId: uid(), deviceId: deviceId(), notebookId, type, payload, ts, synced: 0 };
  await (await db()).add('oplog', op);
}

/** Direct oplog append for the sync engine's backfill (bypasses capture gating). */
export async function appendOpDirect(op: SyncOp): Promise<void> {
  await (await db()).add('oplog', op);
}

async function notebookIdForPage(pageId: string): Promise<string | undefined> {
  const cached = pageNotebook.get(pageId);
  if (cached) return cached;
  const page = await (await db()).get('pages', pageId);
  if (page) pageNotebook.set(pageId, page.notebookId);
  return page?.notebookId;
}

// ---- notebooks ----

export async function listNotebooks(): Promise<Notebook[]> {
  const all = await (await db()).getAll('notebooks');
  return all.filter((n) => !n.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getNotebookIncludingDeleted(id: string): Promise<Notebook | undefined> {
  return (await db()).get('notebooks', id);
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  return (await db()).get('notebooks', id);
}

export async function putNotebook(nb: Notebook): Promise<void> {
  await (await db()).put('notebooks', nb);
  await appendOp(nb.id, 'UPSERT_NOTEBOOK', { notebook: nb }, nb.updatedAt ?? Date.now());
}

export async function createNotebook(title: string, template: TemplateId): Promise<Notebook> {
  const now = Date.now();
  const nb: Notebook = { id: uid(), title, template, createdAt: now, updatedAt: now };
  await putNotebook(nb);
  await createPage(nb.id, template, 0);
  return nb;
}

export async function touchNotebook(id: string): Promise<void> {
  const nb = await getNotebook(id);
  if (nb) await putNotebook({ ...nb, updatedAt: Date.now() });
}

export async function deleteNotebookCascade(id: string): Promise<void> {
  const d = await db();
  const nb = await d.get('notebooks', id);
  if (!nb) return;
  const now = Date.now();
  const pages = await d.getAllFromIndex('pages', 'by-notebook', id);
  for (const p of pages) {
    if (!p.deleted) await d.put('pages', { ...p, deleted: true, updatedAt: now });
    await deleteRecognitionForPage(p.id);
  }
  await d.put('notebooks', { ...nb, deleted: true, updatedAt: now });
  await appendOp(id, 'DELETE_NOTEBOOK', {}, now);
}

// ---- pages ----

export async function listPages(notebookId: string): Promise<Page[]> {
  const pages = await (await db()).getAllFromIndex('pages', 'by-notebook', notebookId);
  return pages.filter((p) => !p.deleted).sort((a, b) => a.order - b.order);
}

export async function listPagesIncludingDeleted(notebookId: string): Promise<Page[]> {
  const pages = await (await db()).getAllFromIndex('pages', 'by-notebook', notebookId);
  return pages.sort((a, b) => a.order - b.order);
}

export async function getPageIncludingDeleted(id: string): Promise<Page | undefined> {
  return (await db()).get('pages', id);
}

export async function getPage(id: string): Promise<Page | undefined> {
  return (await db()).get('pages', id);
}

export async function putPage(page: Page): Promise<void> {
  pageNotebook.set(page.id, page.notebookId);
  await (await db()).put('pages', page);
  await appendOp(page.notebookId, 'UPSERT_PAGE', { page }, page.updatedAt ?? Date.now());
}

export async function createPage(
  notebookId: string,
  template: TemplateId,
  order: number,
  extra?: Partial<Page>
): Promise<Page> {
  const now = Date.now();
  const page: Page = {
    id: uid(),
    notebookId,
    order,
    template,
    w: PAGE_W,
    h: PAGE_H,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
  await putPage(page);
  return page;
}

export async function deletePageCascade(pageId: string): Promise<void> {
  const d = await db();
  const page = await d.get('pages', pageId);
  if (!page) return;
  const now = Date.now();
  await d.put('pages', { ...page, deleted: true, updatedAt: now });
  await deleteRecognitionForPage(pageId); // derived data — rebuilt on demand
  await appendOp(page.notebookId, 'DELETE_PAGE', { pageId }, now);
}

export async function reorderPages(pages: Page[]): Promise<void> {
  const now = Date.now();
  const d = await db();
  const stamped = pages.map((p, i) => ({ ...p, order: i, updatedAt: now }));
  const tx = d.transaction('pages', 'readwrite');
  stamped.forEach((p) => tx.store.put(p));
  await tx.done;
  for (const p of stamped) {
    pageNotebook.set(p.id, p.notebookId);
    await appendOp(p.notebookId, 'UPSERT_PAGE', { page: p }, now);
  }
}

// ---- strokes ----

export async function listStrokes(pageId: string): Promise<Stroke[]> {
  const strokes = await (await db()).getAllFromIndex('strokes', 'by-page', pageId);
  return strokes.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putStroke(stroke: Stroke): Promise<void> {
  await (await db()).put('strokes', stroke);
  const nbId = await notebookIdForPage(stroke.pageId);
  if (nbId) await appendOp(nbId, 'PUT_STROKE', { stroke }, Date.now());
}

export async function putStrokes(strokes: Stroke[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('strokes', 'readwrite');
  for (const s of strokes) tx.store.put(s);
  await tx.done;
  for (const s of strokes) {
    const nbId = await notebookIdForPage(s.pageId);
    if (nbId) await appendOp(nbId, 'PUT_STROKE', { stroke: s }, Date.now());
  }
}

// ---- attachments & rendered PDF page images ----

export async function putAttachment(a: Attachment): Promise<void> {
  await (await db()).put('attachments', a);
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return (await db()).get('attachments', id);
}

export async function putPageImage(pageId: string, blob: Blob): Promise<void> {
  await (await db()).put('pageImages', { pageId, blob });
}

export async function getPageImage(pageId: string): Promise<Blob | undefined> {
  const rec = await (await db()).get('pageImages', pageId);
  return rec?.blob;
}

// ---- feedback ----

export async function addFeedback(fb: FeedbackResult): Promise<void> {
  await (await db()).put('feedback', fb);
  await appendOp(fb.notebookId, 'ADD_FEEDBACK', { feedback: fb }, fb.createdAt);
}

export async function listFeedback(notebookId: string): Promise<FeedbackResult[]> {
  const all = await (await db()).getAllFromIndex('feedback', 'by-notebook', notebookId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

// ---- recognition ----

export async function putRecognition(rec: RecognitionRecord): Promise<void> {
  await (await db()).put('recognition_results', rec);
  await appendOp(rec.notebookId, 'PUT_RECOGNITION', { record: rec }, rec.timestamp);
}

export async function listRecognitionByPage(pageId: string): Promise<RecognitionRecord[]> {
  return (await db()).getAllFromIndex('recognition_results', 'by-page', pageId);
}

export async function listAllRecognition(): Promise<RecognitionRecord[]> {
  return (await db()).getAll('recognition_results');
}

export async function deleteRecognition(key: string): Promise<void> {
  await (await db()).delete('recognition_results', key);
}

export async function deleteRecognitionForPage(pageId: string): Promise<void> {
  const d = await db();
  const rows = await d.getAllFromIndex('recognition_results', 'by-page', pageId);
  const tx = d.transaction('recognition_results', 'readwrite');
  for (const r of rows) tx.store.delete(r.key);
  await tx.done;
}

// ---- settings ----

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const rec = await (await db()).get('settings', key);
  return rec?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', { key, value });
}

// ---- oplog & compaction ----

export async function listUnsyncedOps(limit: number): Promise<SyncOp[]> {
  const d = await db();
  const rows: SyncOp[] = [];
  let cur = await d.transaction('oplog').store.index('by-synced').openCursor(IDBKeyRange.only(0));
  while (cur && rows.length < limit) {
    rows.push({ ...cur.value, seq: cur.primaryKey as number });
    cur = await cur.continue();
  }
  return rows;
}

export async function markOpsSynced(opIds: string[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('oplog', 'readwrite');
  const idx = tx.store.index('by-opid');
  for (const id of opIds) {
    const cur = await idx.openCursor(IDBKeyRange.only(id));
    if (cur) await cur.update({ ...cur.value, synced: 1 });
  }
  await tx.done;
}

export async function listAllOps(): Promise<SyncOp[]> {
  return (await db()).getAll('oplog');
}

export async function countUnsyncedOps(): Promise<number> {
  return (await db()).countFromIndex('oplog', 'by-synced', 0);
}

export async function pruneSyncedOpsBefore(ts: number): Promise<number> {
  const d = await db();
  const tx = d.transaction('oplog', 'readwrite');
  let cur = await tx.store.openCursor();
  let n = 0;
  while (cur) {
    if (cur.value.synced === 1 && cur.value.ts < ts) {
      await cur.delete();
      n++;
    }
    cur = await cur.continue();
  }
  await tx.done;
  return n;
}

/** Purge tombstoned pages/notebooks older than the horizon plus their strokes.
 *  Returns number of purged entities. Recognition rows died at tombstone time. */
export async function compactTombstones(olderThanMs: number): Promise<number> {
  const d = await db();
  const horizon = Date.now() - olderThanMs;
  let purged = 0;
  for (const p of await d.getAll('pages')) {
    if (p.deleted && p.updatedAt <= horizon) {
      for (const s of await d.getAllFromIndex('strokes', 'by-page', p.id)) {
        await d.delete('strokes', s.id);
      }
      await d.delete('pageImages', p.id);
      await d.delete('pages', p.id);
      purged++;
    }
  }
  for (const nb of await d.getAll('notebooks')) {
    if (nb.deleted && nb.updatedAt <= horizon) {
      const left = await d.getAllFromIndex('pages', 'by-notebook', nb.id);
      if (left.length === 0) {
        const fbs = await d.getAllFromIndex('feedback', 'by-notebook', nb.id);
        for (const f of fbs) await d.delete('feedback', f.id);
        await d.delete('notebooks', nb.id);
        purged++;
      }
    }
  }
  return purged;
}
