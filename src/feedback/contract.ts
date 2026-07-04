// SonGul feedback API v1 — wire contract shared by the app (RemoteEngine) and
// the gateway in server/. Type-only module: the server imports these types and
// Node's type stripping erases them, so there is exactly one source of truth.
//
// Design rule (docs/superpowers/specs/2026-07-04): the request already carries
// every evidence channel a future AI provider needs — recognized/typed TEXT,
// raw vector STROKES, and a rendered IMAGE of the selection. Today's rules
// provider reads only `text`; plugging in the real AI changes no client code
// and no wire shape.
import type { Finding, FindingType } from '../types';

export interface WireStrokePoint {
  x: number;
  y: number;
  /** pressure 0..1 */
  p: number;
  /** ms since stroke start */
  t: number;
}

export interface WireStroke {
  points: WireStrokePoint[];
  width: number;
  tool: string;
}

export interface AnalyzeSource {
  /** recognized or user-typed text (rules provider requires this) */
  text?: string;
  /** raw vector ink of the analyzed selection */
  strokes?: WireStroke[];
  /** rendered selection, data:image/png;base64,… — keep the longest edge ≤1024px */
  imagePng?: string;
}

export interface AnalyzeRequest {
  language: 'ko';
  source: AnalyzeSource;
  /** which feedback categories the caller wants; default: all */
  types?: FindingType[];
  /** idempotency / in-flight coalescing key chosen by the client */
  clientRequestId?: string;
}

export type AnalysisStatus = 'done' | 'pending' | 'failed';

export interface AnalyzeResult {
  sourceText: string;
  correctedText: string | null;
  findings: Finding[];
}

export interface AnalyzeResponse {
  analysisId: string;
  status: AnalysisStatus;
  /** provider that produced (or will produce) the result, e.g. "rules-v0" */
  provider: string;
  /** true when served from the content-addressed cache */
  cached: boolean;
  /** server-side processing time */
  latencyMs: number;
  /** present when status === "done" */
  result?: AnalyzeResult;
  /** present when status === "pending" */
  pollAfterMs?: number;
  /** present when status === "failed" */
  error?: string;
}

export interface HealthResponse {
  ok: boolean;
  service: 'songul-feedback-gateway';
  version: string;
  activeProvider: string;
  providers: { id: string; mode: string; ready: boolean; detail?: string }[];
}

export const API_VERSION = 'v1';
