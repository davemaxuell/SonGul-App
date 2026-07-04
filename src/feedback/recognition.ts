// Recognition adapter layer (PLAN.md Milestone 6). Providers are swappable:
// the mock ships first; ML Kit Digital Ink / MyScript iink / a custom SonGul
// model plug in behind the same interface later.
import type { Stroke } from '../types';
import { SongulInk, inkRecognitionAvailable } from '../recognition/songulInk';

export interface RecognitionResult {
  text: string;
  confidence: number;
  provider: string;
}

export interface RecognitionProvider {
  id: string;
  label: string;
  recognize(req: { strokes: Stroke[]; language: string }): Promise<RecognitionResult>;
}

/**
 * Mock provider: returns no text so the panel falls back to manual entry.
 * Keeps the full pipeline (select → recognize → check → feedback) exercisable
 * before a real handwriting-recognition provider is integrated.
 */
export const mockProvider: RecognitionProvider = {
  id: 'mock',
  label: 'Mock (manual input)',
  async recognize() {
    return { text: '', confidence: 0, provider: 'mock' };
  },
};

/** ML Kit "score" semantics vary by model; map to a rough 0..1 confidence. */
function normalizeScore(score: number | undefined): number {
  if (score == null) return 0.9;
  if (score >= 0 && score <= 1) return score;
  return 1 / (1 + Math.abs(score));
}

export const mlkitProvider: RecognitionProvider = {
  id: 'mlkit-android',
  label: 'On-device handwriting (ML Kit)',
  async recognize({ strokes, language }) {
    const live = strokes.filter((s) => !s.deleted && s.points.length > 0);
    if (live.length === 0) return { text: '', confidence: 0, provider: 'mlkit-android' };
    const res = await SongulInk.recognize({
      strokes: live.map((s) => ({
        points: s.points.map((p) => ({ x: p.x, y: p.y, t: p.t })),
      })),
      language,
    });
    const best = res.candidates[0];
    if (!best) return { text: '', confidence: 0, provider: 'mlkit-android' };
    return { text: best.text, confidence: normalizeScore(best.score), provider: 'mlkit-android' };
  },
};

export const providers: RecognitionProvider[] = inkRecognitionAvailable()
  ? [mlkitProvider, mockProvider]
  : [mockProvider];

export function defaultProviderId(): string {
  return providers[0].id;
}

export function getProvider(id: string): RecognitionProvider {
  return providers.find((p) => p.id === id) ?? mockProvider;
}
