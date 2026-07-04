// .songul bundle — portable JSON export/import of a whole notebook,
// including strokes, feedback history, PDF attachments and page backgrounds.
import type { FeedbackResult, Notebook, Page, Stroke } from './types';
import * as db from './db';
import { uid } from './ids';

interface BundleV1 {
  format: 'songul-bundle';
  version: 1;
  exportedAt: number;
  notebook: Notebook;
  pages: Page[];
  strokes: Stroke[];
  feedback: FeedbackResult[];
  attachments: { id: string; name: string; type: string; dataB64: string }[];
  pageImages: { pageId: string; dataB64: string }[];
}

export async function blobToB64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}

export async function exportBundle(notebookId: string): Promise<Blob> {
  const notebook = await db.getNotebook(notebookId);
  if (!notebook) throw new Error('Notebook not found');
  const pages = await db.listPages(notebookId);
  const strokes: Stroke[] = [];
  const pageImages: BundleV1['pageImages'] = [];
  const attachmentIds = new Set<string>();

  for (const p of pages) {
    strokes.push(...(await db.listStrokes(p.id)));
    if (p.pdf) {
      attachmentIds.add(p.pdf.attachmentId);
      const img = await db.getPageImage(p.id);
      if (img) pageImages.push({ pageId: p.id, dataB64: await blobToB64(img) });
    }
  }

  const attachments: BundleV1['attachments'] = [];
  for (const id of attachmentIds) {
    const a = await db.getAttachment(id);
    if (a) {
      attachments.push({ id, name: a.name, type: a.blob.type, dataB64: await blobToB64(a.blob) });
    }
  }

  const bundle: BundleV1 = {
    format: 'songul-bundle',
    version: 1,
    exportedAt: Date.now(),
    notebook,
    pages,
    strokes,
    feedback: await db.listFeedback(notebookId),
    attachments,
    pageImages,
  };
  return new Blob([JSON.stringify(bundle)], { type: 'application/json' });
}

export async function importBundle(file: Blob): Promise<Notebook> {
  const bundle = JSON.parse(await file.text()) as BundleV1;
  if (bundle.format !== 'songul-bundle') throw new Error('Not a .songul bundle');

  // remap every id so re-importing the same bundle never collides
  const nbId = uid();
  const pageMap = new Map<string, string>();
  const attMap = new Map<string, string>();

  const notebook: Notebook = {
    ...bundle.notebook,
    id: nbId,
    title: bundle.notebook.title,
    updatedAt: Date.now(),
  };
  await db.putNotebook(notebook);

  for (const a of bundle.attachments) {
    const newId = uid();
    attMap.set(a.id, newId);
    await db.putAttachment({ id: newId, name: a.name, blob: b64ToBlob(a.dataB64, a.type) });
  }

  for (const p of bundle.pages) {
    const newId = uid();
    pageMap.set(p.id, newId);
    await db.putPage({
      ...p,
      id: newId,
      notebookId: nbId,
      pdf: p.pdf
        ? { attachmentId: attMap.get(p.pdf.attachmentId) ?? p.pdf.attachmentId, pdfPageIndex: p.pdf.pdfPageIndex }
        : undefined,
    });
  }

  for (const img of bundle.pageImages) {
    const pid = pageMap.get(img.pageId);
    if (pid) await db.putPageImage(pid, b64ToBlob(img.dataB64, 'image/png'));
  }

  const strokes = bundle.strokes
    .filter((s) => pageMap.has(s.pageId))
    .map((s) => ({ ...s, id: uid(), pageId: pageMap.get(s.pageId)! }));
  await db.putStrokes(strokes);

  for (const fb of bundle.feedback ?? []) {
    await db.addFeedback({
      ...fb,
      id: uid(),
      notebookId: nbId,
      pageId: pageMap.get(fb.pageId) ?? fb.pageId,
    });
  }

  return notebook;
}
