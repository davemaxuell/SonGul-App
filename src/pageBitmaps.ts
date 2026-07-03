// Small cache for rendered PDF-page background bitmaps.
import type { Page } from './types';
import * as db from './db';

const cache = new Map<string, ImageBitmap>();

export async function loadPageBitmap(page: Page): Promise<ImageBitmap | null> {
  if (!page.pdf) return null;
  const hit = cache.get(page.id);
  if (hit) return hit;
  const blob = await db.getPageImage(page.id);
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob);
  cache.set(page.id, bitmap);
  return bitmap;
}

export function dropPageBitmap(pageId: string): void {
  const bmp = cache.get(pageId);
  if (bmp) {
    bmp.close();
    cache.delete(pageId);
  }
}
