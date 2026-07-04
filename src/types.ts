// SonGul Note — core data model (see docs/PLAN.md §Milestone 2/3).
// Strokes are stored as vectors with pressure metadata so recognition,
// feedback, sync and re-rendering stay possible later.

export const PAGE_W = 820;
export const PAGE_H = 1160;

export type TemplateId =
  | 'blank'
  | 'lined'
  | 'grid'
  | 'dotted'
  | 'hangul'
  | 'topik'
  | 'cornell'
  | 'practice';

export type InkTool = 'pen' | 'highlighter';
export type Tool = InkTool | 'eraser' | 'lasso' | 'hand';

export interface StrokePoint {
  x: number;
  y: number;
  /** pressure 0..1 (0.5 for devices without pressure) */
  p: number;
  /** ms since stroke start */
  t: number;
}

export interface Stroke {
  id: string;
  pageId: string;
  deviceId: string;
  tool: InkTool;
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
  createdAt: number;
  /** tombstone — erased strokes are kept for undo/sync */
  deleted: boolean;
}

export interface PdfBackground {
  attachmentId: string;
  pdfPageIndex: number;
}

export interface Page {
  id: string;
  notebookId: string;
  order: number;
  template: TemplateId;
  w: number;
  h: number;
  pdf?: PdfBackground;
  practice?: { sentences: string[] };
  createdAt: number;
  updatedAt: number;
}

export interface Notebook {
  id: string;
  title: string;
  template: TemplateId;
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  blob: Blob;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FindingType = 'spacing' | 'grammar' | 'spelling' | 'naturalness' | 'handwriting';
export type Severity = 'low' | 'medium' | 'high';

export interface Finding {
  type: FindingType;
  severity: Severity;
  original: string;
  suggestion: string;
  explanation: string;
  explanationEn: string;
  start: number;
  end: number;
}

export interface FeedbackResult {
  id: string;
  notebookId: string;
  pageId: string;
  createdAt: number;
  sourceText: string;
  findings: Finding[];
  bbox?: BBox | null;
}

export type AiMode = 'auto' | 'local' | 'remote';

export interface Settings {
  /** allow finger (touch) input to draw instead of pan */
  fingerDraws: boolean;
  /** use stylus pressure for stroke width */
  pressure: boolean;
  /** 0.5..1.5 pressure response multiplier */
  pressureGain: number;
  defaultTemplate: TemplateId;
  /** feedback engine: auto = server when configured & healthy, else on-device */
  aiMode: AiMode;
  /** SonGul feedback gateway base URL, e.g. http://192.168.0.10:8787 */
  serverUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  fingerDraws: false,
  pressure: true,
  pressureGain: 1,
  defaultTemplate: 'lined',
  aiMode: 'auto',
  serverUrl: '',
};
