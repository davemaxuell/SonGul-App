import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../cloud/supabase', () => ({ cloudConfigured: () => true }));

import * as db from '../../db';
import { uid } from '../../ids';
import type { Stroke } from '../../types';

function mkStroke(pageId: string): Stroke {
  return {
    id: uid(),
    pageId,
    deviceId: 'test-dev',
    tool: 'pen',
    color: '#000',
    width: 3,
    opacity: 1,
    points: [{ x: 1, y: 1, p: 0.5, t: 0 }],
    createdAt: Date.now(),
    deleted: false,
  };
}

describe('op capture', () => {
  it('captures ops for notebook/page/stroke/feedback mutations', async () => {
    const before = (await db.listAllOps()).length;
    const nb = await db.createNotebook('sync test ' + uid(), 'lined'); // notebook + first page
    const pages = await db.listPages(nb.id);
    const s = mkStroke(pages[0].id);
    await db.putStroke(s);
    await db.addFeedback({
      id: uid(),
      notebookId: nb.id,
      pageId: pages[0].id,
      createdAt: Date.now(),
      sourceText: 'x',
      findings: [],
      bbox: null,
    });
    const ops = (await db.listAllOps()).slice(before);
    const types = ops.map((o) => o.type);
    expect(types).toContain('UPSERT_NOTEBOOK');
    expect(types).toContain('UPSERT_PAGE');
    expect(types).toContain('PUT_STROKE');
    expect(types).toContain('ADD_FEEDBACK');
    expect(ops.every((o) => o.notebookId === nb.id)).toBe(true);
    expect(ops.every((o) => o.synced === 0)).toBe(true);
  });

  it('withoutOpCapture suppresses capture', async () => {
    const before = (await db.listAllOps()).length;
    await db.withoutOpCapture(async () => {
      await db.putNotebook({ id: uid(), title: 'silent', template: 'blank', createdAt: 1, updatedAt: 1 });
    });
    expect((await db.listAllOps()).length).toBe(before);
  });

  it('delete cascades tombstone instead of removing rows', async () => {
    const nb = await db.createNotebook('tomb ' + uid(), 'blank');
    const pages = await db.listPages(nb.id);
    const s = mkStroke(pages[0].id);
    await db.putStroke(s);
    await db.deleteNotebookCascade(nb.id);
    expect((await db.listNotebooks()).find((n) => n.id === nb.id)).toBeUndefined();
    expect(await db.getNotebookIncludingDeleted(nb.id)).toMatchObject({ deleted: true });
    expect((await db.listPagesIncludingDeleted(nb.id))[0].deleted).toBe(true);
    // strokes stay for recoverability until compaction
    expect((await db.listStrokes(pages[0].id)).length).toBe(1);
  });

  it('unsynced listing, marking and pruning work', async () => {
    const nb = await db.createNotebook('queue ' + uid(), 'blank');
    const unsynced = await db.listUnsyncedOps(500);
    expect(unsynced.length).toBeGreaterThan(0);
    await db.markOpsSynced(unsynced.map((o) => o.opId));
    expect(await db.countUnsyncedOps()).toBe(0);
    const pruned = await db.pruneSyncedOpsBefore(Date.now() + 60_000);
    expect(pruned).toBeGreaterThan(0);
    void nb;
  });

  it('compactTombstones purges old tombstoned pages and their strokes', async () => {
    const nb = await db.createNotebook('compact ' + uid(), 'blank');
    const pages = await db.listPages(nb.id);
    await db.putStroke(mkStroke(pages[0].id));
    await db.deletePageCascade(pages[0].id);
    // nothing purged while fresh
    expect(await db.compactTombstones(24 * 3600 * 1000)).toBe(0);
    // everything purged with a zero horizon
    expect(await db.compactTombstones(0)).toBeGreaterThan(0);
    expect(await db.getPageIncludingDeleted(pages[0].id)).toBeUndefined();
    expect((await db.listStrokes(pages[0].id)).length).toBe(0);
  });
});
