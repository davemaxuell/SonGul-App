import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../cloud/supabase', () => ({
  cloudConfigured: () => false,
  supabase: () => {
    throw new Error('no server in this test');
  },
  currentUser: () => Promise.resolve(null),
}));

import * as db from '../../db';
import { uid } from '../../ids';
import { exportBundle } from '../../bundle';
import { installSnapshot } from '../blobs';

describe('installSnapshot', () => {
  it('round-trips a notebook with ORIGINAL ids and emits no ops', async () => {
    const nb = await db.createNotebook('snap ' + uid(), 'lined');
    const pages = await db.listPages(nb.id);
    await db.putStroke({
      id: uid(),
      pageId: pages[0].id,
      deviceId: 'd',
      tool: 'pen',
      color: '#000',
      width: 3,
      opacity: 1,
      points: [{ x: 1, y: 2, p: 0.5, t: 0 }],
      createdAt: 7,
      deleted: false,
    });
    const bundleJson = JSON.parse(await (await exportBundle(nb.id)).text());

    const originalPageId = pages[0].id;
    const opsBefore = (await db.listAllOps()).length;
    await installSnapshot(bundleJson);
    expect((await db.listAllOps()).length).toBe(opsBefore); // silent — no ops emitted
    const restoredPages = await db.listPages(nb.id);
    expect(restoredPages.map((p) => p.id)).toContain(originalPageId); // ids preserved
    expect((await db.listStrokes(originalPageId)).length).toBe(1); // same-id put, no dupe
  });
});
