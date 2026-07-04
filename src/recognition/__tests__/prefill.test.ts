import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { RecognitionRecord, Stroke } from '../../types';
import * as db from '../../db';
import { prefillFromClusters } from '../prefill';

let n = 500;
function makeStroke(pageId: string): Stroke {
  n++;
  return {
    id: `pf${n}`,
    pageId,
    deviceId: 'd',
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    createdAt: 0,
    deleted: false,
    points: [{ x: 0, y: 0, p: 0.5, t: 0 }],
  };
}

function rec(
  pageId: string,
  clusterId: string,
  text: string,
  strokeIds: string[],
  y: number
): RecognitionRecord {
  return {
    key: `${pageId}:${clusterId}`,
    notebookId: 'nb',
    pageId,
    clusterId,
    text,
    confidence: 0.9,
    strokeIds,
    bbox: { x: 0, y, w: 100, h: 30 },
    provider: 'test',
    timestamp: 1,
    status: 'ok',
  };
}

describe('prefillFromClusters', () => {
  it('assembles covered clusters top-to-bottom', async () => {
    const a = makeStroke('pp1');
    const b = makeStroke('pp1');
    await db.putRecognition(rec('pp1', 'c1', '두 번째 줄', [b.id], 200));
    await db.putRecognition(rec('pp1', 'c2', '첫 줄', [a.id], 100));
    expect(await prefillFromClusters('pp1', [a, b])).toBe('첫 줄 두 번째 줄');
  });

  it('returns null when nothing matches or coverage is poor', async () => {
    const lone = makeStroke('pp2');
    expect(await prefillFromClusters('pp2', [lone])).toBeNull();
    const covered = makeStroke('pp3');
    const uncovered = [makeStroke('pp3'), makeStroke('pp3'), makeStroke('pp3')];
    await db.putRecognition(rec('pp3', 'c1', '가', [covered.id], 10));
    expect(await prefillFromClusters('pp3', [covered, ...uncovered])).toBeNull();
    expect(await prefillFromClusters('pp3', [])).toBeNull();
  });
});
