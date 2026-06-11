// Target-aware, structured grading for the adaptive learning loop.
// See docs/PRD-adaptive-learning-loop.md (M0). Until the server `/api/check`
// endpoint is upgraded to the structured contract, gradeWriting() falls back to
// a deterministic client-side mock so the whole client can be built + demoed.
import { ApiError } from "@/services/check-writing";
import type { CharacterGrade, GradeInput, GradeResult, SkillKey } from "@/types/songul";
import { SKILL_KEYS } from "@/types/songul";

export const SKILL_TIP: Record<SkillKey, string> = {
  shape: "Even the proportions and round the corners of each block.",
  stroke_order: "Write each block left-to-right, then top-to-bottom.",
  spacing: "Leave a small, even gap between words.",
  grammar: "Check the particle and the verb ending.",
};

// FNV-1a — small, stable string hash so the mock is deterministic per target.
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic stand-in for the real AI grader. Produces a plausible structured
 * breakdown from the target alone (no real recognition): mostly-correct with a
 * couple of flagged characters/skills, stable per target. Dev/offline only.
 */
export function mockGrade(target: string, recognized = target): GradeResult {
  const perCharacter: CharacterGrade[] = [];
  let index = 0;
  for (const char of [...target]) {
    if (char.trim() === "") continue;
    const h = hash(`${target}:${index}:${char}`);
    // Length-independent error rolls so even single jamo/syllables vary.
    const shapeOk = h % 100 >= 22; // ~22% of characters show a shape issue
    const strokeOrderOk = Math.floor(h / 100) % 100 >= 16; // ~16% a stroke-order issue
    const issues: SkillKey[] = [];
    if (!shapeOk) issues.push("shape");
    if (!strokeOrderOk) issues.push("stroke_order");
    perCharacter.push({ index, char, ok: issues.length === 0, shapeOk, strokeOrderOk, issues });
    index += 1;
  }

  const total = perCharacter.length || 1;
  const shapeBad = perCharacter.filter((c) => !c.shapeOk).length;
  const orderBad = perCharacter.filter((c) => !c.strokeOrderOk).length;
  const hasSpaces = /\s/.test(target.trim());
  const perSkill: Record<SkillKey, number> = {
    shape: Math.max(45, Math.round(100 - (shapeBad / total) * 70)),
    stroke_order: Math.max(45, Math.round(100 - (orderBad / total) * 70)),
    spacing: hasSpaces ? (hash(`s${target}`) % 3 === 0 ? 72 : 92) : 100,
    grammar: target.length > 3 ? (hash(`g${target}`) % 4 === 0 ? 76 : 95) : 100,
  };
  const score = Math.round(SKILL_KEYS.reduce((sum, k) => sum + perSkill[k], 0) / SKILL_KEYS.length);
  const worst = [...SKILL_KEYS].sort((a, b) => perSkill[a] - perSkill[b])[0];

  return {
    score,
    recognized,
    correction: target,
    grammarTip: perSkill.grammar < 90 ? SKILL_TIP.grammar : "",
    recommendation: SKILL_TIP[worst],
    perCharacter,
    perSkill,
  };
}

// Coerce an arbitrary server payload into a GradeResult. If the server still
// returns the legacy shape (no perCharacter/perSkill), synthesize a structured
// result from the overall score + target so the client keeps working.
export function validateGrade(value: Partial<GradeResult> & Record<string, unknown>, target: string): GradeResult {
  const score = Math.max(0, Math.min(100, Math.round(Number(value.score) || 0)));

  if (!Array.isArray(value.perCharacter) || !value.perSkill) {
    const base = mockGrade(target, String(value.recognized ?? target));
    // Trust the server's overall score + text; keep the synthesized structure.
    return {
      ...base,
      score: score || base.score,
      recognized: String(value.recognized ?? base.recognized),
      correction: String(value.correction ?? base.correction),
      grammarTip: String(value.grammarTip ?? value["grammar_tip"] ?? base.grammarTip),
      recommendation: String(value.recommendation ?? base.recommendation),
    };
  }

  const perCharacter: CharacterGrade[] = value.perCharacter.map((c, i) => {
    const item = (c ?? {}) as Partial<CharacterGrade>;
    const issues = Array.isArray(item.issues) ? item.issues.filter((s): s is SkillKey => SKILL_KEYS.includes(s as SkillKey)) : [];
    return {
      index: typeof item.index === "number" ? item.index : i,
      char: String(item.char ?? ""),
      shapeOk: item.shapeOk !== false && !issues.includes("shape"),
      strokeOrderOk: item.strokeOrderOk !== false && !issues.includes("stroke_order"),
      ok: item.ok ?? issues.length === 0,
      issues,
    };
  });

  const rawSkill = value.perSkill as Partial<Record<SkillKey, number>>;
  const perSkill = SKILL_KEYS.reduce((acc, k) => {
    acc[k] = Math.max(0, Math.min(100, Math.round(Number(rawSkill[k]) || 0)));
    return acc;
  }, {} as Record<SkillKey, number>);

  return {
    score,
    recognized: String(value.recognized ?? ""),
    correction: String(value.correction ?? value.recognized ?? ""),
    grammarTip: String(value.grammarTip ?? value["grammar_tip"] ?? ""),
    recommendation: String(value.recommendation ?? ""),
    perCharacter,
    perSkill,
  };
}

/**
 * Grade a handwriting image against the target it was supposed to be. Hits the
 * real /api/check (structured contract) when EXPO_PUBLIC_SONGUL_API_BASE_URL is
 * set; otherwise returns the deterministic mock.
 */
export async function gradeWriting(input: GradeInput): Promise<GradeResult> {
  const baseUrl = process.env.EXPO_PUBLIC_SONGUL_API_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    // No server configured (dev/offline): grade with the mock.
    return mockGrade(input.target);
  }

  try {
    const response = await fetch(`${baseUrl}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: input.image, target: input.target, itemType: input.itemType }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error || `Request failed with HTTP ${response.status}.`, response.status);
    }
    return validateGrade(data, input.target);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error ? error.message : "Network request failed.", 0, "NETWORK_ERROR");
  }
}
