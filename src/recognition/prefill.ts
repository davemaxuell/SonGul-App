// Assemble recognized text for a lasso selection from stored cluster results.
import type { Stroke } from '../types';
import * as db from '../db';

/**
 * Returns the selection's text from live-recognition results, or null when
 * the selection isn't sufficiently covered (caller falls back to a one-shot
 * provider call).
 */
export async function prefillFromClusters(
  pageId: string,
  selected: Stroke[]
): Promise<string | null> {
  if (selected.length === 0) return null;
  const records = (await db.listRecognitionByPage(pageId)).filter(
    (r) => r.status === 'ok' && r.text.trim().length > 0
  );
  const selectedIds = new Set(selected.map((s) => s.id));
  const hits = records.filter((r) => r.strokeIds.some((id) => selectedIds.has(id)));
  if (hits.length === 0) return null;
  const covered = new Set(hits.flatMap((r) => r.strokeIds));
  const uncovered = [...selectedIds].filter((id) => !covered.has(id));
  if (uncovered.length > selected.length * 0.2) return null;
  hits.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const text = hits.map((r) => r.text.trim()).join(' ').trim();
  return text.length > 0 ? text : null;
}
