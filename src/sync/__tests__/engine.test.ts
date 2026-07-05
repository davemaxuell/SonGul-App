import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeServer } from './fakeServer';

const fake = vi.hoisted(() => ({
  server: null as unknown as ReturnType<typeof import('./fakeServer').makeFakeServer>,
}));

vi.mock('../../cloud/supabase', () => ({
  cloudConfigured: () => true,
  supabase: () => fake.server,
  currentUser: () => Promise.resolve({ id: 'user-1', email: 'u@x.y' }),
}));

import * as db from '../../db';
import { deviceId, uid } from '../../ids';
import { getSyncStatus, syncNow, _resetForTests } from '../engine';

describe('sync engine', () => {
  beforeEach(async () => {
    fake.server = makeFakeServer();
    await _resetForTests();
  });

  it('pushes local ops, marks them synced, registers the notebook', async () => {
    const nb = await db.createNotebook('push ' + uid(), 'blank');
    await syncNow();
    expect(await db.countUnsyncedOps()).toBe(0);
    expect(fake.server._state.registry.has(nb.id)).toBe(true);
    expect(
      fake.server._state.ops.some((o) => o.notebook_id === nb.id && o.op_type === 'UPSERT_NOTEBOOK')
    ).toBe(true);
    expect(getSyncStatus().state).toBe('idle');
    expect(getSyncStatus().lastSyncAt).not.toBeNull();
  });

  it('pulls foreign ops, applies them, skips echoes, advances the cursor', async () => {
    const nb = await db.createNotebook('pull ' + uid(), 'blank');
    await syncNow(); // own ops now on server (echoes for the next pull)
    fake.server._seedRemoteOp({
      notebook_id: nb.id,
      op_id: uid(),
      author_id: 'user-1',
      device_id: 'other-device',
      op_type: 'UPSERT_NOTEBOOK',
      payload: { notebook: { ...nb, title: 'from tablet', updatedAt: Date.now() + 5 } },
      client_ts: Date.now() + 5,
    });
    await syncNow();
    const row = await db.getNotebookIncludingDeleted(nb.id);
    expect(row?.title).toBe('from tablet');
    // pulling again applies nothing new (cursor advanced past the seeded op)
    const opsBefore = (await db.listAllOps()).length;
    await syncNow();
    expect((await db.listAllOps()).length).toBe(opsBefore);
  });

  it('push is idempotent when the server already has an op_id', async () => {
    const nb = await db.createNotebook('retry ' + uid(), 'blank');
    const unsynced = await db.listUnsyncedOps(500);
    expect(unsynced.length).toBeGreaterThan(0);
    // simulate an earlier push whose ack was lost: server already holds one op
    const first = unsynced[0];
    fake.server._seedRemoteOp({
      notebook_id: first.notebookId,
      op_id: first.opId,
      author_id: 'user-1',
      device_id: first.deviceId,
      op_type: first.type,
      payload: first.payload,
      client_ts: first.ts,
    });
    await syncNow();
    const serverCopies = fake.server._state.ops.filter((o) => o.op_id === first.opId);
    expect(serverCopies.length).toBe(1); // not duplicated
    expect(await db.countUnsyncedOps()).toBe(0); // still marked synced locally
    void nb;
  });

  it('backfills existing local data once when flagged', async () => {
    const nbId = uid();
    await db.withoutOpCapture(async () => {
      await db.putNotebook({ id: nbId, title: 'old data', template: 'blank', createdAt: 1, updatedAt: 1 });
    });
    await db.setSetting('oplogBackfillDone', false);
    await syncNow();
    expect(fake.server._state.ops.some((o) => o.notebook_id === nbId)).toBe(true);
    const opsOnServer = fake.server._state.ops.length;
    await syncNow(); // second run must not duplicate the backfill
    expect(fake.server._state.ops.length).toBe(opsOnServer);
  });

  it('echo suppression: own pushed ops never re-apply', async () => {
    const nb = await db.createNotebook('echo ' + uid(), 'blank');
    await db.putNotebook({ ...nb, title: 'local title', updatedAt: Date.now() + 1 });
    await syncNow(); // push + pull own ops back
    const row = await db.getNotebookIncludingDeleted(nb.id);
    expect(row?.title).toBe('local title');
    expect(row?.syncDev).toBeUndefined(); // never stamped by applyOp
    expect(fake.server._state.ops.every((o) => o.device_id === deviceId())).toBe(true);
  });
});
