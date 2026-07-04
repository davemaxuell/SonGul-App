import { describe, expect, it } from 'vitest';
import type { Stroke } from '../../types';
import { LineClusterer } from '../cluster';

let n = 0;
function makeStroke(x: number, y: number, w = 40, h = 30, createdAt = 0): Stroke {
  n++;
  return {
    id: `s${n}`,
    pageId: 'p1',
    deviceId: 'd',
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    createdAt,
    deleted: false,
    points: [
      { x, y, p: 0.5, t: 0 },
      { x: x + w, y: y + h, p: 0.5, t: 50 },
    ],
  };
}

describe('LineClusterer', () => {
  it('groups strokes on the same line into one cluster', () => {
    const c = new LineClusterer('p1');
    const a = c.addStroke(makeStroke(50, 100), 1000);
    const b = c.addStroke(makeStroke(100, 105), 1100);
    expect(a.id).toBe(b.id);
    expect(c.all()).toHaveLength(1);
    expect(c.all()[0].strokeIds).toHaveLength(2);
  });

  it('puts a stroke on the next line into a new cluster', () => {
    const c = new LineClusterer('p1');
    c.addStroke(makeStroke(50, 100), 1000);
    c.addStroke(makeStroke(50, 200), 1100);
    expect(c.all()).toHaveLength(2);
  });

  it('removes an emptied cluster and reports it', () => {
    const c = new LineClusterer('p1');
    const s = makeStroke(50, 100);
    const cluster = c.addStroke(s, 1000);
    const removed = c.removeStrokes([s.id], [], 2000);
    expect(removed).toEqual([cluster.id]);
    expect(c.all()).toHaveLength(0);
  });

  it('shrinks a cluster bbox when a stroke is removed', () => {
    const c = new LineClusterer('p1');
    const s1 = makeStroke(50, 100);
    const s2 = makeStroke(400, 105);
    c.addStroke(s1, 1000);
    const cluster = c.addStroke(s2, 1100);
    c.removeStrokes([s2.id], [s1], 2000);
    expect(cluster.bbox.x + cluster.bbox.w).toBeLessThan(300);
    expect(cluster.dirty).toBe(true);
  });

  it('quietDirty honors the quiet window', () => {
    const c = new LineClusterer('p1');
    const cluster = c.addStroke(makeStroke(50, 100), 1000);
    expect(c.quietDirty(1500, 2000)).toHaveLength(0);
    expect(c.quietDirty(1500, 2600)).toHaveLength(1);
    c.markClean(cluster.id);
    expect(c.quietDirty(1500, 9999)).toHaveLength(0);
  });

  it('rebuilds clusters from initial strokes, skipping deleted', () => {
    const line1a = makeStroke(50, 100, 40, 30, 1);
    const line1b = makeStroke(100, 102, 40, 30, 2);
    const line2 = makeStroke(50, 300, 40, 30, 3);
    const gone = { ...makeStroke(50, 500), deleted: true };
    const c = new LineClusterer('p1', [line2, line1a, gone, line1b]);
    expect(c.all()).toHaveLength(2);
    expect(c.clusterOf(line1a.id)?.id).toBe(c.clusterOf(line1b.id)?.id);
  });
});
