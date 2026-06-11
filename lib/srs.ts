// Spaced-repetition scheduling for write-items (M1). A lightweight SM-2 variant
// driven by the 0-100 grade. Pure functions so they're trivially testable; the
// caller passes `now` (ms) and persists the returned SrsState.
import type { SrsState } from "@/types/songul";

const DAY_MS = 86_400_000;
const MIN_EASE = 1.3;

export const PASS_SCORE = 75; // an item "passes" a rep at or above this score

export function initSrs(itemId: string, now: number): SrsState {
  const iso = new Date(now).toISOString();
  return { itemId, ease: 2.5, intervalDays: 0, dueAt: iso, reps: 0, lapses: 0, mastery: 0, lastScore: 0, updatedAt: iso };
}

// 0-100 score -> SM-2 recall quality 0-5.
function quality(score: number): number {
  if (score >= 95) return 5;
  if (score >= 85) return 4;
  if (score >= PASS_SCORE) return 3;
  if (score >= 60) return 2;
  if (score >= 40) return 1;
  return 0;
}

export function reviewItem(prev: SrsState | null, itemId: string, score: number, now: number): SrsState {
  const state = prev ?? initSrs(itemId, now);
  const q = quality(score);
  const passed = q >= 3;

  // SM-2 ease adjustment, floored.
  const ease = Math.max(MIN_EASE, state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  let reps = state.reps;
  let lapses = state.lapses;
  let intervalDays = state.intervalDays;
  if (passed) {
    reps += 1;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 3;
    else intervalDays = Math.max(1, Math.round(intervalDays * ease));
  } else {
    reps = 0;
    lapses += 1;
    intervalDays = 0; // resurface today
  }

  // Mastery: exponential smoothing toward the normalized score (0-1).
  const mastery = Math.max(0, Math.min(1, state.mastery * 0.6 + (score / 100) * 0.4));

  return {
    itemId,
    ease,
    intervalDays,
    reps,
    lapses,
    mastery,
    lastScore: score,
    dueAt: new Date(now + intervalDays * DAY_MS).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

export function isDue(state: SrsState, now: number): boolean {
  return new Date(state.dueAt).getTime() <= now;
}
