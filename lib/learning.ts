// Session scheduler for the adaptive loop (M1). Decides what to write next by
// blending due reviews (SRS), new curriculum items (level-gated by mastery), and
// a weak-skill drill. Pure orchestration over the database query functions.
import { getCurriculumItems, getSkillProfile, getSrsStates } from "@/lib/database";
import { generateBatch } from "@/lib/generate";
import { isDue } from "@/lib/srs";
import type { LearnItem, QueueEntry, ScaffoldLevel, SkillKey, SrsState } from "@/types/songul";

const UNLOCK_MASTERY = 0.6; // a level unlocks the next once its avg mastery clears this
const DRILL_THRESHOLD = 0.6; // skills below this (once practiced) earn a drill
const DEFAULT_SESSION = 12;

// Scaffolding fades as mastery rises: new -> trace, learning -> reference, known -> memory.
export function scaffoldFor(srs: SrsState | undefined): ScaffoldLevel {
  if (!srs || srs.reps === 0) return "trace";
  if (srs.mastery < 0.5) return "reference";
  return "memory";
}

function maxUnlockedLevel(items: LearnItem[], srs: Map<string, SrsState>): number {
  const levels = [...new Set(items.map((item) => item.level))].sort((a, b) => a - b);
  let unlocked = levels[0] ?? 1;
  for (let i = 0; i < levels.length - 1; i += 1) {
    const levelItems = items.filter((item) => item.level === levels[i]);
    const avg = levelItems.length
      ? levelItems.reduce((sum, item) => sum + (srs.get(item.id)?.mastery ?? 0), 0) / levelItems.length
      : 0;
    if (avg >= UNLOCK_MASTERY) unlocked = levels[i + 1];
    else break;
  }
  return unlocked;
}

function weakestSkill(): SkillKey | null {
  const weak = getSkillProfile()
    .filter((s) => s.attempts > 0 && s.mastery < DRILL_THRESHOLD)
    .sort((a, b) => a.mastery - b.mastery)[0];
  return weak?.skill ?? null;
}

export function buildQueue(now = Date.now(), size = DEFAULT_SESSION): QueueEntry[] {
  const srs = getSrsStates();
  // Once sentences are unlocked and new authored items run low, generate more
  // targeting the weakest skill so the path never dead-ends.
  const authored = getCurriculumItems().filter((item) => item.source === "authored");
  if (maxUnlockedLevel(authored, srs) >= 4) {
    const freshNew = getCurriculumItems().filter((item) => item.level <= 4 && !srs.has(item.id)).length;
    if (freshNew < size) generateBatch(weakestSkill() ?? "spacing", size - freshNew);
  }
  const items = getCurriculumItems();
  const maxLevel = maxUnlockedLevel(items, srs);
  const byId = new Map(items.map((item) => [item.id, item]));

  const due: QueueEntry[] = [...srs.values()]
    .filter((s) => s.reps > 0 && isDue(s, now) && byId.has(s.itemId))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() || a.mastery - b.mastery)
    .map((s) => {
      const item = byId.get(s.itemId);
      if (!item) throw new Error(`missing item ${s.itemId}`);
      return { item, kind: "due" as const, scaffold: scaffoldFor(s) };
    });

  const newItems: QueueEntry[] = items
    .filter((item) => item.level <= maxLevel && !srs.has(item.id))
    .map((item) => ({ item, kind: "new" as const, scaffold: "trace" as const }));

  // ~60% due, fill the rest with new, then top up with remaining due.
  const dueQuota = Math.min(due.length, Math.ceil(size * 0.6));
  const queue: QueueEntry[] = [...due.slice(0, dueQuota)];
  for (const entry of [...newItems, ...due.slice(dueQuota)]) {
    if (queue.length >= size) break;
    queue.push(entry);
  }

  // Inject one weak-skill drill near the front.
  const weak = weakestSkill();
  if (weak) {
    const inQueue = new Set(queue.map((entry) => entry.item.id));
    const drillItem = items.find(
      (item) => item.level <= maxLevel && item.skillTags.includes(weak) && !inQueue.has(item.id),
    );
    if (drillItem) {
      queue.splice(Math.min(1, queue.length), 0, {
        item: drillItem,
        kind: "drill",
        scaffold: scaffoldFor(srs.get(drillItem.id)),
      });
      if (queue.length > size) queue.pop();
    }
  }

  return queue;
}

export type QueueSummary = {
  total: number;
  newCount: number;
  dueCount: number;
  drillCount: number;
  drillSkill: SkillKey | null;
};

export function summarizeQueue(now = Date.now(), size = DEFAULT_SESSION): QueueSummary {
  const queue = buildQueue(now, size);
  return {
    total: queue.length,
    newCount: queue.filter((e) => e.kind === "new").length,
    dueCount: queue.filter((e) => e.kind === "due").length,
    drillCount: queue.filter((e) => e.kind === "drill").length,
    drillSkill: weakestSkill(),
  };
}
