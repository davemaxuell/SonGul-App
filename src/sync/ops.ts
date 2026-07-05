// Sync op model + deterministic LWW apply (spec §11.2/§11.3). One op = one row
// change; ops are the ONLY thing devices exchange.
import * as db from '../db';
import type { FeedbackResult, Notebook, Page, RecognitionRecord, Stroke } from '../types';

export type SyncOpType =
  | 'UPSERT_NOTEBOOK'
  | 'DELETE_NOTEBOOK'
  | 'UPSERT_PAGE'
  | 'DELETE_PAGE'
  | 'PUT_STROKE'
  | 'ADD_FEEDBACK'
  | 'PUT_RECOGNITION'
  | 'ADD_COMMENT';

export interface SyncOp {
  opId: string;
  /** local autoIncrement key; absent before insert */
  seq?: number;
  deviceId: string;
  notebookId: string;
  type: SyncOpType;
  payload: unknown;
  /** client wall clock — LWW basis */
  ts: number;
  /** 0 = pending push, 1 = on server (IndexedDB indexes can't use booleans) */
  synced: 0 | 1;
}

export type OpPayloads = {
  UPSERT_NOTEBOOK: { notebook: Notebook };
  DELETE_NOTEBOOK: Record<string, never>;
  UPSERT_PAGE: { page: Page };
  DELETE_PAGE: { pageId: string };
  PUT_STROKE: { stroke: Stroke };
  ADD_FEEDBACK: { feedback: FeedbackResult };
  PUT_RECOGNITION: { record: RecognitionRecord };
  ADD_COMMENT: { comment: unknown };
};

/** Deterministic LWW: incoming wins on strictly greater (ts, deviceId). */
export function lwwNewer(incTs: number, incDev: string, curTs: number, curDev: string): boolean {
  if (incTs !== curTs) return incTs > curTs;
  return incDev > curDev;
}

function wins(op: SyncOp, cur: { syncTs?: number; syncDev?: string; updatedAt?: number } | undefined): boolean {
  if (!cur) return true;
  return lwwNewer(op.ts, op.deviceId, cur.syncTs ?? cur.updatedAt ?? 0, cur.syncDev ?? '');
}

/** Apply one remote op into local stores. Never emits ops itself. */
export async function applyOp(op: SyncOp): Promise<void> {
  await db.withoutOpCapture(async () => {
    switch (op.type) {
      case 'UPSERT_NOTEBOOK': {
        const { notebook } = op.payload as OpPayloads['UPSERT_NOTEBOOK'];
        const cur = await db.getNotebookIncludingDeleted(notebook.id);
        if (wins(op, cur)) {
          await db.putNotebook({ ...notebook, syncTs: op.ts, syncDev: op.deviceId });
        }
        break;
      }
      case 'DELETE_NOTEBOOK': {
        const cur = await db.getNotebookIncludingDeleted(op.notebookId);
        if (cur && wins(op, cur)) {
          await db.putNotebook({ ...cur, deleted: true, updatedAt: op.ts, syncTs: op.ts, syncDev: op.deviceId });
          for (const p of await db.listPagesIncludingDeleted(op.notebookId)) {
            if (!p.deleted) {
              await db.putPage({ ...p, deleted: true, updatedAt: op.ts, syncTs: op.ts, syncDev: op.deviceId });
            }
          }
        }
        break;
      }
      case 'UPSERT_PAGE': {
        const { page } = op.payload as OpPayloads['UPSERT_PAGE'];
        const cur = await db.getPageIncludingDeleted(page.id);
        if (wins(op, cur)) {
          await db.putPage({ ...page, syncTs: op.ts, syncDev: op.deviceId });
        }
        break;
      }
      case 'DELETE_PAGE': {
        const { pageId } = op.payload as OpPayloads['DELETE_PAGE'];
        const cur = await db.getPageIncludingDeleted(pageId);
        if (cur && wins(op, cur)) {
          await db.putPage({ ...cur, deleted: true, updatedAt: op.ts, syncTs: op.ts, syncDev: op.deviceId });
          await db.deleteRecognitionForPage(pageId);
        }
        break;
      }
      case 'PUT_STROKE': {
        const { stroke } = op.payload as OpPayloads['PUT_STROKE'];
        const all = await db.listStrokes(stroke.pageId);
        const cur = all.find((s) => s.id === stroke.id);
        if (wins(op, cur)) {
          await db.putStroke({ ...stroke, syncTs: op.ts, syncDev: op.deviceId });
        }
        break;
      }
      case 'ADD_FEEDBACK': {
        const { feedback } = op.payload as OpPayloads['ADD_FEEDBACK'];
        const existing = await db.listFeedback(feedback.notebookId);
        if (!existing.some((f) => f.id === feedback.id)) {
          await db.addFeedback(feedback);
        }
        break;
      }
      case 'PUT_RECOGNITION': {
        const { record } = op.payload as OpPayloads['PUT_RECOGNITION'];
        const rows = await db.listRecognitionByPage(record.pageId);
        const cur = rows.find((r) => r.key === record.key);
        if (!cur || lwwNewer(op.ts, op.deviceId, cur.syncTs ?? cur.timestamp, cur.syncDev ?? '')) {
          await db.putRecognition({ ...record, syncTs: op.ts, syncDev: op.deviceId });
        }
        break;
      }
      case 'ADD_COMMENT':
        // arrives in Phase 5; ignore quietly so mixed-version devices don't crash
        break;
    }
  });
}
