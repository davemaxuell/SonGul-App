import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../cloud/supabase', () => ({ cloudConfigured: () => true }));

import * as db from '../../db';
import { uid } from '../../ids';
import { applyOp } from '../ops';
import type { Comment } from '../../types';

function mkComment(notebookId: string, pageId: string, text: string): Comment {
  return {
    id: uid(),
    notebookId,
    pageId,
    bbox: { x: 1, y: 2, w: 3, h: 4 },
    text,
    authorEmail: 'teacher@example.com',
    createdAt: Date.now(),
  };
}

describe('comments', () => {
  it('addComment stores the row and captures an ADD_COMMENT op', async () => {
    const nb = await db.createNotebook('cm ' + uid(), 'blank');
    const pages = await db.listPages(nb.id);
    const before = (await db.listAllOps()).length;
    const c = mkComment(nb.id, pages[0].id, '띄어쓰기를 확인하세요');
    await db.addComment(c);
    expect((await db.listCommentsByPage(pages[0].id)).map((x) => x.id)).toContain(c.id);
    const newOps = (await db.listAllOps()).slice(before);
    expect(newOps.some((o) => o.type === 'ADD_COMMENT' && o.notebookId === nb.id)).toBe(true);
  });

  it('applyOp ADD_COMMENT is put-if-absent and never re-captures', async () => {
    const nb = await db.createNotebook('cm2 ' + uid(), 'blank');
    const pages = await db.listPages(nb.id);
    const c = mkComment(nb.id, pages[0].id, 'original');
    const before = (await db.listAllOps()).length;
    await applyOp({
      opId: uid(), deviceId: 'remote', notebookId: nb.id, type: 'ADD_COMMENT',
      payload: { comment: c }, ts: Date.now(), synced: 1,
    });
    await applyOp({
      opId: uid(), deviceId: 'remote', notebookId: nb.id, type: 'ADD_COMMENT',
      payload: { comment: { ...c, text: 'dupe' } }, ts: Date.now() + 1, synced: 1,
    });
    const rows = await db.listCommentsByPage(pages[0].id);
    expect(rows.filter((r) => r.id === c.id).length).toBe(1);
    expect(rows.find((r) => r.id === c.id)?.text).toBe('original');
    expect((await db.listAllOps()).length).toBe(before); // apply is silent
  });

  it('purgeNotebookLocal removes every row and the notebook ops, others untouched', async () => {
    const keep = await db.createNotebook('keep ' + uid(), 'blank');
    const gone = await db.createNotebook('gone ' + uid(), 'blank');
    const gonePages = await db.listPages(gone.id);
    await db.putStroke({
      id: uid(), pageId: gonePages[0].id, deviceId: 'd', tool: 'pen', color: '#000',
      width: 3, opacity: 1, points: [{ x: 0, y: 0, p: 0.5, t: 0 }], createdAt: 1, deleted: false,
    });
    await db.addComment(mkComment(gone.id, gonePages[0].id, 'bye'));
    await db.purgeNotebookLocal(gone.id);
    expect(await db.getNotebookIncludingDeleted(gone.id)).toBeUndefined();
    expect((await db.listPagesIncludingDeleted(gone.id)).length).toBe(0);
    expect((await db.listStrokes(gonePages[0].id)).length).toBe(0);
    expect((await db.listCommentsByNotebook(gone.id)).length).toBe(0);
    expect((await db.listAllOps()).some((o) => o.notebookId === gone.id)).toBe(false);
    expect(await db.getNotebookIncludingDeleted(keep.id)).toBeDefined();
    expect((await db.listAllOps()).some((o) => o.notebookId === keep.id)).toBe(true);
  });
});
