// Export: PDF (background raster @2x + ink as vector paths) and PNG.
import { PDFDocument, rgb, LineCapStyle } from 'pdf-lib';
import type { Notebook, Page, Settings, Stroke } from '../types';
import * as db from '../db';
import { buildOutline, chaikin, resample } from '../ink/geometry';
import { drawPageBackground, renderPageToCanvas } from '../ink/render';
import { loadPageBitmap } from '../pageBitmaps';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const v = parseInt(
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h,
    16
  );
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}

async function backgroundPngBytes(page: Page): Promise<Uint8Array> {
  const bitmap = await loadPageBitmap(page);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.w * 2);
  canvas.height = Math.round(page.h * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  drawPageBackground(ctx, page, bitmap);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function strokeSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`;
  }
  return d;
}

export async function exportNotebookPdf(
  notebook: Notebook,
  pages: Page[],
  settings: Pick<Settings, 'pressure' | 'pressureGain'>
): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle(notebook.title);
  doc.setProducer('SonGul Note');

  for (const page of pages) {
    const pdfPage = doc.addPage([page.w, page.h]);
    const png = await doc.embedPng(await backgroundPngBytes(page));
    pdfPage.drawImage(png, { x: 0, y: 0, width: page.w, height: page.h });

    const strokes = (await db.listStrokes(page.id)).filter((s) => !s.deleted);
    for (const s of strokes) {
      const { r, g, b } = hexToRgb(s.color);
      if (s.tool === 'highlighter') {
        const pts = chaikin(resample(s.points, 2), 1);
        const d = strokeSvgPath(pts);
        if (!d) continue;
        pdfPage.drawSvgPath(d, {
          x: 0,
          y: page.h,
          borderColor: rgb(r, g, b),
          borderWidth: s.width,
          borderOpacity: s.opacity,
          borderLineCap: LineCapStyle.Butt,
        });
      } else {
        const outline = buildOutline(s.points, s.width, settings.pressure, settings.pressureGain);
        if (outline.length < 3) continue;
        const d = strokeSvgPath(outline) + ' Z';
        pdfPage.drawSvgPath(d, {
          x: 0,
          y: page.h,
          color: rgb(r, g, b),
          opacity: s.opacity,
        });
      }
    }
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function exportPagePng(
  page: Page,
  strokes: Stroke[],
  settings: Pick<Settings, 'pressure' | 'pressureGain'>
): Promise<Blob> {
  const bitmap = await loadPageBitmap(page);
  const canvas = document.createElement('canvas');
  renderPageToCanvas(canvas, page, strokes, bitmap, 2, settings);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
