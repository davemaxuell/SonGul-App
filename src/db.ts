// Local-first storage layer (IndexedDB). Strokes are written individually the
// moment they are committed, which doubles as crash recovery: reopening the
// app replays everything that reached the store.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Attachment,
  FeedbackResult,
  Notebook,
  Page,
  Stroke,
  TemplateId,
} from './types';
import { PAGE_H, PAGE_W } from './types';
import { uid } from './ids';

interface SongulDB extends DBSchema {
  notebooks: { key: string; value: Notebook };
  pages: { key: string; value: Page; indexes: { 'by-notebook': string } };
  strokes: { key: string; value: Stroke; indexes: { 'by-page': string } };
  attachments: { key: string; value: Attachment };
  pageImages: { key: string; value: { pageId: string; blob: Blob } };
  feedback: { key: string; value: FeedbackResult; indexes: { 'by-notebook': string } };
  settings: { key: string; value: { key: string; value: unknown } };
}

let dbPromise: Promise<IDBPDatabase<SongulDB>> | null = null;

function db(): Promise<IDBPDatabase<SongulDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SongulDB>('songul-note', 1, {
      upgrade(d) {
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
      },
    });
  }
  return dbPromise;
}

// ---- notebooks ----

export async function listNotebooks(): Promise<Notebook[]> {
  const all = await (await db()).getAll('notebooks');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  return (await db()).get('notebooks', id);
}

export async function putNotebook(nb: Notebook): Promise<void> {
  await (await db()).put('notebooks', nb);
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
  const pages = await d.getAllFromIndex('pages', 'by-notebook', id);
  for (const p of pages) {
    const strokes = await d.getAllFromIndex('strokes', 'by-page', p.id);
    for (const s of strokes) await d.delete('strokes', s.id);
    await d.delete('pageImages', p.id);
    await d.delete('pages', p.id);
  }
  const fbs = await d.getAllFromIndex('feedback', 'by-notebook', id);
  for (const f of fbs) await d.delete('feedback', f.id);
  await d.delete('notebooks', id);
}

// ---- pages ----

export async function listPages(notebookId: string): Promise<Page[]> {
  const pages = await (await db()).getAllFromIndex('pages', 'by-notebook', notebookId);
  return pages.sort((a, b) => a.order - b.order);
}

export async function getPage(id: string): Promise<Page | undefined> {
  return (await db()).get('pages', id);
}

export async function putPage(page: Page): Promise<void> {
  await (await db()).put('pages', page);
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
  const strokes = await d.getAllFromIndex('strokes', 'by-page', pageId);
  for (const s of strokes) await d.delete('strokes', s.id);
  await d.delete('pageImages', pageId);
  await d.delete('pages', pageId);
}

export async function reorderPages(pages: Page[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('pages', 'readwrite');
  pages.forEach((p, i) => {
    tx.store.put({ ...p, order: i });
  });
  await tx.done;
}

// ---- strokes ----

export async function listStrokes(pageId: string): Promise<Stroke[]> {
  const strokes = await (await db()).getAllFromIndex('strokes', 'by-page', pageId);
  return strokes.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putStroke(stroke: Stroke): Promise<void> {
  await (await db()).put('strokes', stroke);
}

export async function putStrokes(strokes: Stroke[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('strokes', 'readwrite');
  for (const s of strokes) tx.store.put(s);
  await tx.done;
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
}

export async function listFeedback(notebookId: string): Promise<FeedbackResult[]> {
  const all = await (await db()).getAllFromIndex('feedback', 'by-notebook', notebookId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

// ---- settings ----

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const rec = await (await db()).get('settings', key);
  return rec?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', { key, value });
}
