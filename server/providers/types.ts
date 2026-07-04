// FeedbackProvider — the seam where analysis engines plug into the gateway.
// The gateway tries providers in priority order and falls back down the chain
// on failure/timeout, so adding the real AI never risks breaking feedback.
import type { AnalyzeRequest, AnalyzeResult } from '../../src/feedback/contract.ts';

export interface NormalizedRequest extends AnalyzeRequest {
  /** NFC-normalized, trimmed text (empty string when the client sent none) */
  normText: string;
}

export interface FeedbackProvider {
  id: string;
  mode: 'rules' | 'external-ai';
  /** lower runs first */
  priority: number;
  ready(): boolean;
  detail(): string | undefined;
  analyze(req: NormalizedRequest): Promise<AnalyzeResult>;
}

export class UnsupportedSourceError extends Error {
  code = 'UNSUPPORTED_SOURCE' as const;
  constructor(message: string) {
    super(message);
  }
}
