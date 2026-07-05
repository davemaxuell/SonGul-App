// Sync op model (spec §11.2). One op = one row change; ops are the ONLY thing
// devices exchange. The LWW apply logic joins this module in the next task.
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
