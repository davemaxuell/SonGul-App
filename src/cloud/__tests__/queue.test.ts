import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { flushPending, pendingBackups, queueBackup } from '../queue';

describe('pending backup queue', () => {
  it('queues without duplicates and flushes successes', async () => {
    await queueBackup('nb1');
    await queueBackup('nb1');
    await queueBackup('nb2');
    expect(await pendingBackups()).toEqual(['nb1', 'nb2']);
    const done = await flushPending(async (id) => {
      if (id === 'nb2') throw new Error('still failing');
    });
    expect(done).toBe(1);
    expect(await pendingBackups()).toEqual(['nb2']);
  });
});
