# M0 — Structured Grading Spike (go/no-go)

**Question:** Can the AI return a **reliable, structured per-character + per-skill grading of Korean handwriting from an image**, given the intended target? Everything downstream (adaptive scheduling, inline annotation, mastery) depends on a yes.

**Why this is a gate:** if the model can recognize Hangul but *cannot* reliably attribute errors to specific characters, skills (shape / stroke-order / spacing / grammar), the per-character annotation and skill-mastery tracking collapse to a single overall score, and the loop reverts toward the current coarse design.

> This spike runs **outside this repo** (needs the server + Gemini key + real handwriting images). The client is already built against the same contract via the mock in `services/grading.ts`, so a green result here is a one-line swap (`EXPO_PUBLIC_SONGUL_API_BASE_URL`).

## Contract under test

**Request** `POST /api/check`
```jsonc
{ "image": "<base64 jpeg>", "target": "학교에 가요.", "itemType": "sentence" }
```
**Response**
```jsonc
{
  "score": 0,                 // 0-100 overall
  "recognized": "학교에 가요.",
  "correction": "학교에 가요.",
  "grammarTip": "…",
  "recommendation": "…",
  "perCharacter": [
    { "index": 0, "char": "학", "ok": true,  "shapeOk": true,  "strokeOrderOk": true,  "issues": [] },
    { "index": 1, "char": "교", "ok": false, "shapeOk": false, "strokeOrderOk": true,  "issues": ["shape"] }
  ],
  "perSkill": { "shape": 0, "stroke_order": 0, "spacing": 0, "grammar": 0 }  // each 0-100
}
```
`index` counts non-space characters. `issues` ⊆ `["shape","stroke_order","spacing","grammar"]`. Type contract: `types/songul.ts` (`GradeResult`).

## Candidate Gemini prompt (starting point)

> You are a Korean handwriting tutor. The learner was asked to write the TARGET: `"{target}"`. You are given a photo of their handwriting. Return ONLY JSON matching this schema: `{score, recognized, correction, grammarTip, recommendation, perCharacter:[{index,char,ok,shapeOk,strokeOrderOk,issues}], perSkill:{shape,stroke_order,spacing,grammar}}`.
> - `recognized` = what they actually wrote. Compare against TARGET.
> - For each non-space character of what they wrote, judge letter **shape** (proportion, closed/round forms) and **stroke order** if inferable; list failing skills in `issues`.
> - `perSkill` = 0-100 aggregate per skill across the whole sample. `spacing` = word gaps; `grammar` only for word/sentence targets.
> - Be specific and encouraging in `recommendation` (one actionable next step). No prose outside the JSON.

Stroke order from a static image is the **least certain** signal; if it proves unreliable, drop `strokeOrderOk` to "unknown" rather than guessing (the client already treats a missing/true value as ok).

## Eval design

1. **Dataset:** 20-30 real handwriting images across difficulty (jamo, syllables, words, sentences), each with its known target and a **human-rated ground truth** (per-character ok/not, the dominant skill error, overall 1-5).
2. **Run** each through the candidate prompt; parse JSON (measure JSON-validity rate first — must be ≥95%).
3. **Score the grader against ground truth:**
   - Recognition accuracy (`recognized` vs what was actually written).
   - Per-character `ok` agreement (precision/recall vs human).
   - Skill-attribution agreement (does the flagged skill match the human's dominant error?).
   - Overall-score correlation (model `score` vs human 1-5).
4. **Stability:** re-run a subset 3× (temperature low); flag high variance.

## Go / no-go criteria (proposed)

| Signal | Go | Caution | No-go |
|---|---|---|---|
| JSON validity | ≥95% | 85-95% | <85% |
| Recognition accuracy | ≥90% | 75-90% | <75% |
| Per-character ok agreement | ≥0.8 F1 | 0.6-0.8 | <0.6 |
| Skill attribution match | ≥70% | 50-70% | <50% |
| Stroke-order reliability | usable | mark "unknown" | drop the signal |

- **Go:** build the full per-character + per-skill loop as designed.
- **Caution:** ship per-character `ok` + `perSkill` shape/spacing/grammar, but treat stroke-order as advisory (teach it from authored stroke-order data rather than grade it).
- **No-go:** fall back to per-skill-only grading (no per-character marks); the annotation UI degrades to skill chips + the model-shape overlay.

## Outcome

Record the result here, then set `EXPO_PUBLIC_SONGUL_API_BASE_URL` and remove the mock fallback in `services/grading.ts:gradeWriting` (or keep it as the offline path).
