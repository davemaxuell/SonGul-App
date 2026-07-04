// external-ai — the plug-in point for the real SonGul AI handwriting-feedback
// API. Everything around this file is already wired: the gateway calls it
// first when it is ready(), enforces the timeout, caches its results, and
// falls back to rules-v0 on any failure.
//
// ┌───────────────────────────────────────────────────────────────────────┐
// │ WHEN THE AI API ARRIVES, DO EXACTLY THIS:                             │
// │  1. server/.env → set SONGUL_AI_URL and SONGUL_AI_KEY                 │
// │     (optional: SONGUL_AI_TIMEOUT_MS, default 8000)                    │
// │  2. Replace the two mapping functions below (toAiPayload /            │
// │     fromAiResponse) with the vendor's request/response shapes.        │
// │  3. Restart. /v1/health shows external-ai ready:true — the app        │
// │     needs no change: it already sends text + strokes + imagePng.      │
// └───────────────────────────────────────────────────────────────────────┘
import type { AnalyzeResult } from '../../src/feedback/contract.ts';
import type { Finding } from '../../src/types.ts';
import type { FeedbackProvider, NormalizedRequest } from './types.ts';

const AI_URL = process.env.SONGUL_AI_URL ?? '';
const AI_KEY = process.env.SONGUL_AI_KEY ?? '';
export const AI_TIMEOUT_MS = Number(process.env.SONGUL_AI_TIMEOUT_MS ?? 8000);

/** our normalized request → vendor payload.  ⚠ placeholder mapping */
function toAiPayload(req: NormalizedRequest): unknown {
  return {
    language: req.language,
    text: req.normText || undefined,
    strokes: req.source.strokes, // vector ink: x/y/pressure/time per point
    image_png: req.source.imagePng, // rendered selection (data URL)
    feedback_types: req.types ?? ['spacing', 'grammar', 'spelling', 'naturalness', 'handwriting'],
  };
}

/** vendor response → our AnalyzeResult.  ⚠ placeholder mapping */
function fromAiResponse(body: unknown): AnalyzeResult {
  const b = body as {
    source_text?: string;
    corrected_text?: string | null;
    findings?: Finding[];
  };
  return {
    sourceText: b.source_text ?? '',
    correctedText: b.corrected_text ?? null,
    findings: Array.isArray(b.findings) ? b.findings : [],
  };
}

export const externalAiProvider: FeedbackProvider = {
  id: 'external-ai',
  mode: 'external-ai',
  priority: 0, // preferred over rules when configured
  ready: () => Boolean(AI_URL && AI_KEY),
  detail: () =>
    AI_URL ? `configured → ${new URL(AI_URL).host}` : 'not configured (set SONGUL_AI_URL / SONGUL_AI_KEY)',
  async analyze(req: NormalizedRequest): Promise<AnalyzeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${AI_KEY}`,
        },
        body: JSON.stringify(toAiPayload(req)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`AI API ${res.status}`);
      return fromAiResponse(await res.json());
    } finally {
      clearTimeout(timer);
    }
  },
};
