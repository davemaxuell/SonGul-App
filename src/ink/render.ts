// Canvas rendering for pages: paper, templates, PDF backgrounds and strokes.
import type { Page, Settings, Stroke, StrokePoint } from '../types';
import { buildOutline, chaikin, resample, type Pt } from './geometry';
import { drawTemplate } from '../templates';

export const PAPER = '#FFFDF7';

export function outlinePath(poly: Pt[]): Path2D {
  const path = new Path2D();
  if (poly.length === 0) return path;
  path.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
  path.closePath();
  return path;
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  settings: Pick<Settings, 'pressure' | 'pressureGain'>
): void {
  if (stroke.points.length === 0) return;
  ctx.save();
  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = stroke.opacity;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    const pts = chaikin(resample(stroke.points, 2), 1);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  } else {
    ctx.globalAlpha = stroke.opacity;
    ctx.fillStyle = stroke.color;
    const poly = buildOutline(stroke.points, stroke.width, settings.pressure, settings.pressureGain);
    ctx.fill(outlinePath(poly));
  }
  ctx.restore();
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  settings: Pick<Settings, 'pressure' | 'pressureGain'>,
  skipIds?: Set<string>
): void {
  for (const s of strokes) {
    if (s.deleted) continue;
    if (skipIds && skipIds.has(s.id)) continue;
    drawStroke(ctx, s, settings);
  }
}

/** live (in-progress) stroke preview, including predicted tail */
export function drawLiveStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  predicted: StrokePoint[],
  settings: Pick<Settings, 'pressure' | 'pressureGain'>
): void {
  const merged: Stroke =
    predicted.length > 0 ? { ...stroke, points: [...stroke.points, ...predicted] } : stroke;
  drawStroke(ctx, merged, settings);
}

/** paper rectangle + template or PDF background, in page coordinates */
export function drawPageBackground(
  ctx: CanvasRenderingContext2D,
  page: Page,
  bgBitmap: ImageBitmap | null
): void {
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, page.w, page.h);
  if (page.pdf && bgBitmap) {
    ctx.drawImage(bgBitmap, 0, 0, page.w, page.h);
  } else {
    drawTemplate(ctx, page);
  }
  ctx.restore();
}

/** Render a full page (background + ink) onto a canvas at the given pixel scale. */
export function renderPageToCanvas(
  canvas: HTMLCanvasElement,
  page: Page,
  strokes: Stroke[],
  bgBitmap: ImageBitmap | null,
  pixelScale: number,
  settings: Pick<Settings, 'pressure' | 'pressureGain'>
): void {
  canvas.width = Math.max(1, Math.round(page.w * pixelScale));
  canvas.height = Math.max(1, Math.round(page.h * pixelScale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  drawPageBackground(ctx, page, bgBitmap);
  drawStrokes(ctx, strokes, settings);
}
