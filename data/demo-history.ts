// =============================================================================
// [DEMO-DATA] ⚠️ FAKE DATA — DELETE WHEN THE BACKEND LANDS ⚠️
// =============================================================================
// What's left of the demo layer after the journal became real saved canvases:
// a filled-in progress blend for the dashboard and the word-of-the-day ritual.
// Pure in-memory; nothing here touches SQLite.
//
// To remove: delete this file and grep for "[DEMO-DATA]" — every call site is
// tagged with the same marker.
// =============================================================================
import type { LearningProgress } from "@/lib/database";

const DEMO_STREAK = 12;
const DEMO_SEEN_ITEMS = 41;

function daysAgo(offset: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // noon, so timezone shifts can't move the day
  d.setDate(d.getDate() - offset);
  return d;
}

// [DEMO-DATA] Filled-in skill profile shown until the learner has real attempts.
const DEMO_SKILLS: LearningProgress["skills"] = [
  { skill: "shape", mastery: 0.78, attempts: 34, lastSeen: daysAgo(1).toISOString() },
  { skill: "stroke_order", mastery: 0.71, attempts: 29, lastSeen: daysAgo(2).toISOString() },
  { skill: "spacing", mastery: 0.83, attempts: 21, lastSeen: daysAgo(1).toISOString() },
  { skill: "grammar", mastery: 0.76, attempts: 18, lastSeen: daysAgo(1).toISOString() },
];

/**
 * [DEMO-DATA] Blend a fake month of momentum into real progress so the
 * dashboard reads as lived-in. Real numbers always win once they exist;
 * `todayCount` is never touched (the daily goal loop stays honest).
 */
export function demoAugmentedProgress(real: LearningProgress): LearningProgress {
  return {
    ...real,
    streak: Math.max(real.streak, DEMO_STREAK),
    seenItems: Math.min(real.totalItems, Math.max(real.seenItems, DEMO_SEEN_ITEMS)),
    skills: real.skills.some((s) => s.attempts > 0) ? real.skills : DEMO_SKILLS,
  };
}

// ---- Activity calendar blend --------------------------------------------------
/**
 * [DEMO-DATA] Fill the activity calendar with the same fabricated month the
 * rest of the dashboard tells: practice started ~30 days ago, rest days on
 * offsets 13/20/27, heavier intensity through the current 12-day streak.
 * Real counts always win for any day that has them.
 */
export function demoAugmentedActivity(real: Map<string, number>): Map<string, number> {
  const merged = new Map(real);
  for (let offset = 1; offset <= 30; offset += 1) {
    if (offset === 13 || offset === 20 || offset === 27) continue; // rest days
    const key = daysAgo(offset).toISOString().slice(0, 10);
    const jitter = (offset * 2654435761) % 7; // deterministic, stable per day
    const count = offset <= 12 ? 5 + (jitter % 6) : 2 + (jitter % 4);
    merged.set(key, Math.max(merged.get(key) ?? 0, count));
  }
  return merged;
}

// ---- Word of the day ---------------------------------------------------------
// [DEMO-DATA] A small rotating ritual for the Today hero. Stable per calendar
// day so it doesn't shuffle on re-render.
const WORDS_OF_DAY = [
  { ko: "하늘", romanization: "haneul", meaning: "sky" },
  { ko: "바다", romanization: "bada", meaning: "sea" },
  { ko: "꽃", romanization: "kkot", meaning: "flower" },
  { ko: "구름", romanization: "gureum", meaning: "cloud" },
  { ko: "별", romanization: "byeol", meaning: "star" },
  { ko: "바람", romanization: "baram", meaning: "wind" },
  { ko: "달", romanization: "dal", meaning: "moon" },
  { ko: "숲", romanization: "sup", meaning: "forest" },
  { ko: "마음", romanization: "maeum", meaning: "heart, mind" },
  { ko: "꿈", romanization: "kkum", meaning: "dream" },
] as const;

export function demoWordOfDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return WORDS_OF_DAY[dayOfYear % WORDS_OF_DAY.length];
}

// [DEMO-DATA] Everyday expressions, rotating on the same daily rhythm.
const EXPRESSIONS_OF_DAY = [
  { ko: "화이팅!", romanization: "hwaiting!", meaning: "you can do it!" },
  { ko: "잘 먹겠습니다", romanization: "jal meokgesseumnida", meaning: "thanks for the meal (before eating)" },
  { ko: "괜찮아요", romanization: "gwaenchanayo", meaning: "it's okay" },
  { ko: "수고하셨습니다", romanization: "sugohasyeosseumnida", meaning: "great work today" },
  { ko: "오랜만이에요", romanization: "oraenmanieyo", meaning: "long time no see" },
  { ko: "천천히 하세요", romanization: "cheoncheonhi haseyo", meaning: "take your time" },
  { ko: "맛있게 드세요", romanization: "masitge deuseyo", meaning: "enjoy your meal" },
  { ko: "잘 자요", romanization: "jal jayo", meaning: "sleep well" },
] as const;

export function demoExpressionOfDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  // Offset so the pair never feels like one list read twice.
  return EXPRESSIONS_OF_DAY[(dayOfYear + 3) % EXPRESSIONS_OF_DAY.length];
}
