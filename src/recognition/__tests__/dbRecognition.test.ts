import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from '../../db';
import type { RecognitionRecord } from '../../types';

function rec(pageId: string, clusterId: string, text: string): RecognitionRecord {
  return {
    key: `${pageId}:${clusterId}`,
    notebookId: 'nb1',
    pageId,
    clusterId,
    text,
    confidence: 0.9,
    strokeIds: ['s1'],
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    provider: 'test',
    timestamp: 1,
    status: 'ok',
  };
}

describe('recognition_results store', () => {
  it('puts, lists by page, lists all, deletes', async () => {
    await db.putRecognition(rec('pA', 'c1', '안녕'));
    await db.putRecognition(rec('pA', 'c2', '하세요'));
    await db.putRecognition(rec('pB', 'c1', '한국'));
    expect((await db.listRecognitionByPage('pA')).map((r) => r.text).sort()).toEqual([
      '안녕',
      '하세요',
    ]);
    expect(await db.listAllRecognition()).toHaveLength(3);
    await db.deleteRecognition('pA:c1');
    expect(await db.listRecognitionByPage('pA')).toHaveLength(1);
    await db.deleteRecognitionForPage('pA');
    expect(await db.listRecognitionByPage('pA')).toHaveLength(0);
  });

  it('cascades with page deletion', async () => {
    const page = await db.createPage('nb2', 'lined', 0);
    await db.putRecognition(rec(page.id, 'c9', '지워질 글'));
    await db.deletePageCascade(page.id);
    expect(await db.listRecognitionByPage(page.id)).toHaveLength(0);
  });
});
