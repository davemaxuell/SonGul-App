// =============================================================================
// [DEMO-DATA] ⚠️ FAKE DATA — DELETE WHEN THE BACKEND LANDS ⚠️
// =============================================================================
// A local pretend "weekly league" so the leaderboard UI exists before accounts
// or a server do. Rivals are fixed; the learner's own score nudges upward with
// today's real practice so the table feels alive. Pure in-memory.
//
// To remove: delete this file and grep for "[DEMO-DATA]".
// =============================================================================

export type LeagueRow = {
  rank: number;
  name: string;
  flag: string;
  points: number;
  streak: number;
  /** Rank movement vs yesterday, for the ▲/▼ chips. */
  delta: number;
  isYou: boolean;
};

const RIVALS = [
  { name: "Minji", flag: "🇰🇷", points: 540, streak: 21, delta: 0 },
  { name: "Yuki", flag: "🇯🇵", points: 486, streak: 17, delta: 1 },
  { name: "Linh", flag: "🇻🇳", points: 451, streak: 9, delta: -1 },
  { name: "Sasha", flag: "🇷🇺", points: 377, streak: 12, delta: 2 },
  { name: "Wei", flag: "🇨🇳", points: 305, streak: 6, delta: -2 },
  { name: "Putri", flag: "🇮🇩", points: 268, streak: 8, delta: 1 },
  { name: "Emma", flag: "🇺🇸", points: 214, streak: 4, delta: -1 },
];

/**
 * [DEMO-DATA] Build this week's table. `writtenToday` is the learner's real
 * count for today, so practicing visibly climbs the league within the demo.
 */
export function getDemoLeaderboard(userName: string, writtenToday: number, streak: number): LeagueRow[] {
  const you = {
    name: userName,
    flag: "🇺🇸",
    points: 320 + writtenToday * 12,
    streak,
    delta: writtenToday > 0 ? 1 : 0,
    isYou: true,
  };
  return [...RIVALS.map((r) => ({ ...r, isYou: false })), you]
    .sort((a, b) => b.points - a.points)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
