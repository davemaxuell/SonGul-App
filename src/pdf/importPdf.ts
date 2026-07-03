// PDF import: each PDF page becomes a notebook page whose background is an
// immutable rendered image; the original PDF bytes are kept as an attachment.
// Ink lives on a separate editable layer (PLAN.md Milestone 5).
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Page } from '../types';
import { PAGE_W } from '../types';
import * as db from '../db';
import { uid } from '../ids';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfImportProgress {
  page: number;
  total: number;
}

/**
 * Import a PDF into a notebook, inserting pages starting at `startOrder`.
 * Returns the created pages (callers must reorder/refresh their page list).
 */
export async function importPdfIntoNotebook(
  file: File,
  notebookId: string,
  startOrder: number,
  onProgress?: (p: PdfImportProgress) => void
): Promise<Page[]> {
  const bytes = await file.arrayBuffer();
  const attachmentId = uid();
  await db.putAttachment({
    id: attachmentId,
    name: file.name,
    blob: new Blob([bytes], { type: 'application/pdf' }),
  });

  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const created: Page[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.({ page: i, total: doc.numPages });
    const pdfPage = await doc.getPage(i);
    const vp1 = pdfPage.getViewport({ scale: 1 });
    const pageW = PAGE_W;
    const pageH = Math.round((vp1.height / vp1.width) * pageW);

    // render at 2x page resolution for crisp zooming
    const renderScale = (pageW * 2) / vp1.width;
    const viewport = pdfPage.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
    );

    const page = await db.createPage(notebookId, 'blank', startOrder + i - 1, {
      w: pageW,
      h: pageH,
      pdf: { attachmentId, pdfPageIndex: i - 1 },
    });
    await db.putPageImage(page.id, blob);
    created.push(page);
  }

  await doc.destroy();
  await db.touchNotebook(notebookId);
  return created;
}
