import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../cloud/supabase', () => ({ cloudConfigured: () => false }));

import * as db from '../../db';
import { uid } from '../../ids';
import { applyOp, lwwNewer } from '../ops';
import type { SyncOp } from '../ops';
import type { Notebook, Stroke } from '../../types';

function op(partial: Partial<SyncOp> & Pick<SyncOp, 'notebookId' | 'type' | 'payload'>): SyncOp {
  return { opId: uid(), deviceId: 'remote-dev', ts: Date.now(), synced: 1, ...partial };
}

function nb(id: string, title: string): Notebook {
  return { id, title, template: 'blank', createdAt: 1, updatedAt: 1 };
}

function stroke(id: string, pageId: string, deleted = false): Stroke {
  return {
    id,
    pageId,
    deviceId: 'remote-dev',
    tool: 'pen',
    color: '#000',
    width: 3,
    opacity: 1,
    points: [{ x: 0, y: 0, p: 0.5, t: 0 }],
    createdAt: 1,
    deleted,
  };
}

describe('lwwNewer', () => {
  it('orders by ts then deviceId, rejects equal', () => {
    expect(lwwNewer(2, 'a', 1, 'z')).toBe(true);
    expect(lwwNewer(1, 'z', 2, 'a')).toBe(false);
    expect(lwwNewer(1, 'b', 1, 'a')).toBe(true);
    expect(lwwNewer(1, 'a', 1, 'a')).toBe(false);
  });
});

describe('applyOp', () => {
  it('applies notebook upsert and stamps syncTs/syncDev; ignores stale updates', async () => {
    const id = uid();
    await applyOp(op({ notebookId: id, type: 'UPSERT_NOTEBOOK', payload: { notebook: nb(id, 'fresh') }, ts: 100 }));
    let row = await db.getNotebookIncludingDeleted(id);
    expect(row?.title).toBe('fresh');
    expect(row?.syncTs).toBe(100);
    await applyOp(op({ notebookId: id, type: 'UPSERT_NOTEBOOK', payload: { notebook: nb(id, 'stale') }, ts: 50 }));
    row = await db.getNotebookIncludingDeleted(id);
    expect(row?.title).toBe('fresh');
  });

  it('applies in either order to the same final state (row convergence)', async () => {
    const id1 = uid();
    await applyOp(
      op({ notebookId: id1, type: 'UPSERT_NOTEBOOK', payload: { notebook: nb(id1, 'A') }, ts: 100, deviceId: 'devA' })
    );
    await applyOp(
      op({ notebookId: id1, type: 'UPSERT_NOTEBOOK', payload: { notebook: nb(id1, 'B') }, ts: 100, deviceId: 'devB' })
    );
    const r1 = (await db.getNotebookIncludingDeleted(id1))?.title;

    const id2 = uid();
    await applyOp(
      op({ notebookId: id2, type: 'UPSERT_NOTEBOOK', payload: { notebook: nb(id2, 'B') }, ts: 100, deviceId: 'devB' })
    );
    await applyOp(
      op({ notebookId: id2, type: 'UPSERT_NOTEBOOK', payload: { notebook: nb(id2, 'A') }, ts: 100, deviceId: 'devA' })
    );
    const r2 = (await db.getNotebookIncludingDeleted(id2))?.title;

    expect(r1).toBe(r2); // devB wins both times (same ts, higher deviceId)
    expect(r1).toBe('B');
  });

  it('DELETE_PAGE tombstones; PUT_STROKE upserts; ADD_FEEDBACK is put-if-absent', async () => {
    const nbId = uid();
    const pgId = uid();
    await applyOp(
      op({
        notebookId: nbId,
        type: 'UPSERT_PAGE',
        payload: {
          page: { id: pgId, notebookId: nbId, order: 0, template: 'blank', w: 820, h: 1160, createdAt: 1, updatedAt: 1 },
        },
        ts: 10,
      })
    );
    await applyOp(op({ notebookId: nbId, type: 'PUT_STROKE', payload: { stroke: stroke(uid(), pgId) }, ts: 11 }));
    expect((await db.listStrokes(pgId)).length).toBe(1);
    await applyOp(op({ notebookId: nbId, type: 'DELETE_PAGE', payload: { pageId: pgId }, ts: 12 }));
    expect((await db.getPageIncludingDeleted(pgId))?.deleted).toBe(true);
    const fb = { id: uid(), notebookId: nbId, pageId: pgId, createdAt: 5, sourceText: 'orig', findings: [], bbox: null };
    await applyOp(op({ notebookId: nbId, type: 'ADD_FEEDBACK', payload: { feedback: fb }, ts: 13 }));
    await applyOp(
      op({ notebookId: nbId, type: 'ADD_FEEDBACK', payload: { feedback: { ...fb, sourceText: 'dupe' } }, ts: 14 })
    );
    const listed = await db.listFeedback(nbId);
    expect(listed.length).toBe(1);
    expect(listed[0].sourceText).toBe('orig');
  });

  it('does not re-capture ops while applying', async () => {
    const before = (await db.listAllOps()).length;
    await applyOp(op({ notebookId: uid(), type: 'UPSERT_NOTEBOOK', payload: { notebook: nb(uid(), 'no echo') }, ts: 1 }));
    expect((await db.listAllOps()).length).toBe(before);
  });
});
