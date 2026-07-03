// Recognition adapter layer (PLAN.md Milestone 6). Providers are swappable:
// the mock ships first; ML Kit Digital Ink / MyScript iink / a custom SonGul
// model plug in behind the same interface later.
import type { Stroke } from '../types';

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

export const providers: RecognitionProvider[] = [mockProvider];

export function getProvider(id: string): RecognitionProvider {
  return providers.find((p) => p.id === id) ?? mockProvider;
}
