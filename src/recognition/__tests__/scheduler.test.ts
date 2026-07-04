import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../../types';
import type { RecognitionProvider } from '../../feedback/recognition';
import * as db from '../../db';
import { RecognitionScheduler } from '../scheduler';

let n = 100;
function makeStroke(pageId: string, y: number): Stroke {
  n++;
  return {
    id: `t${n}`,
    pageId,
    deviceId: 'd',
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    createdAt: 0,
    deleted: false,
    points: [
      { x: 10, y, p: 0.5, t: 0 },
      { x: 60, y: y + 20, p: 0.5, t: 40 },
    ],
  };
}

function makeProvider(impl: () => Promise<string>): RecognitionProvider {
  return {
    id: 'fake',
    label: 'fake',
    recognize: async () => ({ text: await impl(), confidence: 1, provider: 'fake' }),
  };
}

function makeScheduler(provider: RecognitionProvider, clock: { t: number }) {
  return new RecognitionScheduler({
    notebookId: 'nb-s',
    provider,
    quietMs: 1500,
    tickMs: 60_000, // effectively disabled; tests call tick() directly
    now: () => clock.t,
  });
}

describe('RecognitionScheduler', () => {
  it('recognizes a quiet dirty cluster and persists the result', async () => {
    const clock = { t: 1000 };
    const s = makeScheduler(makeProvider(async () => '안녕'), clock);
    const stroke = makeStroke('pg1', 50);
    s.loadPage('pg1', [stroke]);
    s.noteStroke('pg1', stroke);
    await s.tick();
    expect(await db.listRecognitionByPage('pg1')).toHaveLength(0); // not quiet yet
    clock.t = 3000;
    await s.tick();
    const rows = await db.listRecognitionByPage('pg1');
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('안녕');
    expect(rows[0].status).toBe('ok');
    clock.t = 9000;
    await s.tick(); // clean cluster: nothing new recognized
    expect(await db.listRecognitionByPage('pg1')).toHaveLength(1);
    s.dispose();
  });

  it('retries once, then parks the cluster as failed', async () => {
    const clock = { t: 1000 };
    let calls = 0;
    const s = makeScheduler(
      makeProvider(async () => {
        calls++;
        throw new Error('boom');
      }),
      clock
    );
    const stroke = makeStroke('pg2', 50);
    s.loadPage('pg2', [stroke]);
    s.noteStroke('pg2', stroke);
    clock.t = 3000;
    await s.tick();
    await s.tick();
    await s.tick();
    expect(calls).toBe(2);
    const rows = await db.listRecognitionByPage('pg2');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    s.dispose();
  });

  it('deletes stored results when a cluster empties', async () => {
    const clock = { t: 1000 };
    const s = makeScheduler(makeProvider(async () => '가'), clock);
    const stroke = makeStroke('pg3', 50);
    s.loadPage('pg3', [stroke]);
    s.noteStroke('pg3', stroke);
    clock.t = 3000;
    await s.tick();
    expect(await db.listRecognitionByPage('pg3')).toHaveLength(1);
    s.noteRemoved('pg3', [stroke.id]);
    await new Promise((r) => setTimeout(r, 0)); // let the delete settle
    expect(await db.listRecognitionByPage('pg3')).toHaveLength(0);
    s.dispose();
  });
});
