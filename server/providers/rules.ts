// rules-v0 — the on-server twin of the app's offline checker. It imports the
// SAME checkKorean() module the app bundles, so on-device and server feedback
// can never drift apart. Requires text; ink-only requests are for AI providers.
import { applyFindings, checkKorean } from '../../src/feedback/korean.ts';
import type { AnalyzeResult } from '../../src/feedback/contract.ts';
import { UnsupportedSourceError, type FeedbackProvider, type NormalizedRequest } from './types.ts';

export const rulesProvider: FeedbackProvider = {
  id: 'rules-v0',
  mode: 'rules',
  priority: 10,
  ready: () => true,
  detail: () => 'shared korean.ts checkers (spacing/particles/spelling/register)',
  async analyze(req: NormalizedRequest): Promise<AnalyzeResult> {
    if (!req.normText) {
      throw new UnsupportedSourceError(
        'rules-v0 needs source.text — handwriting-only analysis requires the AI provider'
      );
    }
    const wanted = req.types?.length ? new Set(req.types) : null;
    const findings = checkKorean(req.normText).filter((f) => !wanted || wanted.has(f.type));
    return {
      sourceText: req.normText,
      correctedText: findings.some((f) => f.end > f.start)
        ? applyFindings(req.normText, findings)
        : null,
      findings,
    };
  },
};
