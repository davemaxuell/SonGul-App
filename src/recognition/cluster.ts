// Line clustering for live handwriting recognition. Groups a page's strokes
// into "line clusters" by vertical overlap; clusters are derived data —
// always rebuildable from the stroke list, never a source of truth.
import type { BBox, Stroke } from '../types';
import { strokeBBox, bboxUnion } from '../ink/geometry';

export interface LineCluster {
  id: string;
  pageId: string;
  strokeIds: string[];
  bbox: BBox;
  lastChangedAt: number;
  dirty: boolean;
}

const MIN_OVERLAP = 0.4;

/** vertical overlap as a fraction of the shorter box's height */
export function verticalOverlapRatio(a: BBox, b: BBox): number {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (bottom <= top) return 0;
  return (bottom - top) / Math.max(1, Math.min(a.h, b.h));
}

export class LineClusterer {
  private clusters = new Map<string, LineCluster>();
  private byStroke = new Map<string, string>();
  private seq = 0;

  constructor(
    readonly pageId: string,
    initial: Stroke[] = []
  ) {
    const live = initial.filter((s) => !s.deleted).sort((a, b) => a.createdAt - b.createdAt);
    for (const s of live) this.addStroke(s, s.createdAt);
  }

  all(): LineCluster[] {
    return [...this.clusters.values()];
  }

  clusterOf(strokeId: string): LineCluster | undefined {
    const id = this.byStroke.get(strokeId);
    return id ? this.clusters.get(id) : undefined;
  }

  /** assign a committed stroke to the best-overlapping cluster (or a new one) */
  addStroke(stroke: Stroke, now = Date.now()): LineCluster {
    const bb = strokeBBox(stroke);
    let best: LineCluster | null = null;
    let bestOverlap = 0;
    for (const c of this.clusters.values()) {
      const ov = verticalOverlapRatio(bb, c.bbox);
      if (ov >= MIN_OVERLAP && ov > bestOverlap) {
        best = c;
        bestOverlap = ov;
      }
    }
    if (best) {
      best.strokeIds.push(stroke.id);
      best.bbox = bboxUnion(best.bbox, bb);
      best.lastChangedAt = now;
      best.dirty = true;
      this.byStroke.set(stroke.id, best.id);
      return best;
    }
    const cluster: LineCluster = {
      id: `c${this.seq++}-${stroke.id}`,
      pageId: this.pageId,
      strokeIds: [stroke.id],
      bbox: bb,
      lastChangedAt: now,
      dirty: true,
    };
    this.clusters.set(cluster.id, cluster);
    this.byStroke.set(stroke.id, cluster.id);
    return cluster;
  }

  /**
   * Drop erased/undone strokes from their clusters; recompute bboxes from
   * `remaining` (the page's live strokes). Emptied clusters are deleted.
   * Returns the ids of clusters removed entirely (caller prunes their
   * stored recognition results).
   */
  removeStrokes(ids: string[], remaining: Stroke[], now = Date.now()): string[] {
    const byId = new Map(remaining.map((s) => [s.id, s]));
    const touched = new Set<LineCluster>();
    const removed: string[] = [];
    for (const id of ids) {
      const c = this.clusterOf(id);
      if (!c) continue;
      c.strokeIds = c.strokeIds.filter((sid) => sid !== id);
      this.byStroke.delete(id);
      touched.add(c);
    }
    for (const c of touched) {
      if (c.strokeIds.length === 0) {
        this.clusters.delete(c.id);
        removed.push(c.id);
        continue;
      }
      let bb: BBox | null = null;
      for (const sid of c.strokeIds) {
        const s = byId.get(sid);
        if (!s) continue;
        bb = bb ? bboxUnion(bb, strokeBBox(s)) : strokeBBox(s);
      }
      if (bb) c.bbox = bb;
      c.lastChangedAt = now;
      c.dirty = true;
    }
    return removed;
  }

  markDirty(strokeIds: string[], now = Date.now()): void {
    for (const id of strokeIds) {
      const c = this.clusterOf(id);
      if (c) {
        c.dirty = true;
        c.lastChangedAt = now;
      }
    }
  }

  /** dirty clusters that have been untouched for at least quietMs */
  quietDirty(quietMs: number, now = Date.now()): LineCluster[] {
    return this.all().filter((c) => c.dirty && now - c.lastChangedAt >= quietMs);
  }

  markClean(clusterId: string): void {
    const c = this.clusters.get(clusterId);
    if (c) c.dirty = false;
  }
}
