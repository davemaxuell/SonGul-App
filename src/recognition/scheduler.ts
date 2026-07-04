// Write-behind recognition: watches line clusters per page and recognizes
// quiet dirty clusters one at a time. Never on the pen's critical path.
import type { Stroke } from '../types';
import type { RecognitionProvider } from '../feedback/recognition';
import { LineClusterer, type LineCluster } from './cluster';
import * as db from '../db';

export interface SchedulerOptions {
  notebookId: string;
  provider: RecognitionProvider;
  language?: string;
  /** cluster must be untouched this long before recognition (default 1500ms) */
  quietMs?: number;
  /** poll interval (default 1000ms) */
  tickMs?: number;
  /** injectable clock for tests */
  now?: () => number;
}

export class RecognitionScheduler {
  private clusterers = new Map<string, LineClusterer>();
  private strokesByPage = new Map<string, Stroke[]>();
  private retried = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null;
  private busy = false;
  private readonly quietMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: SchedulerOptions) {
    this.quietMs = opts.quietMs ?? 1500;
    this.now = opts.now ?? Date.now;
    this.timer = setInterval(() => void this.tick(), opts.tickMs ?? 1000);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** (re)load a page: rebuild clusters from its live strokes.
      Keeps a reference to the array — the editor mutates it in place. */
  loadPage(pageId: string, strokes: Stroke[]): void {
    this.strokesByPage.set(pageId, strokes);
    this.clusterers.set(pageId, new LineClusterer(pageId, strokes));
  }

  noteStroke(pageId: string, stroke: Stroke): void {
    this.clusterers.get(pageId)?.addStroke(stroke, this.now());
  }

  noteRemoved(pageId: string, strokeIds: string[]): void {
    const clusterer = this.clusterers.get(pageId);
    if (!clusterer) return;
    const live = (this.strokesByPage.get(pageId) ?? []).filter((s) => !s.deleted);
    const removed = clusterer.removeStrokes(strokeIds, live, this.now());
    for (const clusterId of removed) void db.deleteRecognition(`${pageId}:${clusterId}`);
  }

  noteChanged(pageId: string, strokeIds: string[]): void {
    this.clusterers.get(pageId)?.markDirty(strokeIds, this.now());
  }

  /** one unit of background work; public so tests can drive it directly */
  async tick(): Promise<void> {
    if (this.busy) return;
    let target: { pageId: string; cluster: LineCluster } | null = null;
    for (const [pageId, clusterer] of this.clusterers) {
      const quiet = clusterer.quietDirty(this.quietMs, this.now());
      if (quiet.length > 0) {
        target = { pageId, cluster: quiet[0] };
        break;
      }
    }
    if (!target) return;
    this.busy = true;
    const { pageId, cluster } = target;
    const key = `${pageId}:${cluster.id}`;
    const changedAt = cluster.lastChangedAt;
    try {
      const all = this.strokesByPage.get(pageId) ?? [];
      const ids = new Set(cluster.strokeIds);
      const strokes = all.filter((s) => ids.has(s.id) && !s.deleted);
      const result = await this.opts.provider.recognize({
        strokes,
        language: this.opts.language ?? 'ko',
      });
      await db.putRecognition({
        key,
        notebookId: this.opts.notebookId,
        pageId,
        clusterId: cluster.id,
        text: result.text,
        confidence: result.confidence,
        strokeIds: [...cluster.strokeIds],
        bbox: cluster.bbox,
        provider: result.provider,
        timestamp: this.now(),
        status: 'ok',
      });
      // don't mark clean if new strokes landed while we were recognizing
      if (cluster.lastChangedAt === changedAt) {
        this.clusterers.get(pageId)?.markClean(cluster.id);
      }
      this.retried.delete(key);
    } catch {
      if (this.retried.has(key)) {
        await db.putRecognition({
          key,
          notebookId: this.opts.notebookId,
          pageId,
          clusterId: cluster.id,
          text: '',
          confidence: 0,
          strokeIds: [...cluster.strokeIds],
          bbox: cluster.bbox,
          provider: this.opts.provider.id,
          timestamp: this.now(),
          status: 'failed',
        });
        if (cluster.lastChangedAt === changedAt) {
          this.clusterers.get(pageId)?.markClean(cluster.id);
        }
        this.retried.delete(key);
      } else {
        this.retried.add(key); // stays dirty → retried on a later tick
      }
    } finally {
      this.busy = false;
    }
  }
}
