import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

import { curriculum, LEVELS } from "@/data/curriculum";
import { demoFeedback } from "@/data/songul-content";
import { getGeneratedItems } from "@/lib/generate";
import { isDue, reviewItem } from "@/lib/srs";
import {
  SKILL_KEYS,
  type DashboardSnapshot,
  type FeedbackHistoryItem,
  type FeedbackResult,
  type GradeResult,
  type LearnItem,
  type PracticeAttemptInput,
  type ScaffoldLevel,
  type SkillKey,
  type SkillMastery,
  type SrsState,
  type Stroke,
} from "@/types/songul";

type AttemptRow = {
  id: number;
  created_at: string;
  date_key: string;
  prompt: string;
  score: number;
  recognized: string;
  correction: string;
  feedback_json: string;
  strokes_json: string | null;
};

type CountRow = { count: number };
type AvgRow = { average_score: number | null };

// The open SQLite handle, created on demand. Stays null until first use (or the
// web warm-up below) so it can never be read while undefined — including after a
// Fast Refresh re-evaluates this module.
let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  return (db ??= SQLite.openDatabaseSync("songul.db"));
}

// On web, expo-sqlite's synchronous API (execSync/getAllSync/...) drives a Web
// Worker via a busy-wait on a SharedArrayBuffer. The worker is created lazily on
// first use, so the very first *sync* call races the worker's one-time WASM/OPFS
// init and throws "Sync operation timeout". Awaiting one async open first warms
// that singleton worker, after which every sync call (via getDb) resolves fast.
// On native, openDatabaseSync is already instant, so getDb() handles it lazily.
export async function prepareDatabase(): Promise<void> {
  if (Platform.OS === "web" && !db) {
    db = await SQLite.openDatabaseAsync("songul.db");
  }
  try {
    initDatabase();
  } catch (error) {
    // On a cold, asset-heavy first load (fonts + CanvasKit + the wa-sqlite
    // worker all fetching at once) the sync bridge can still lose its one-time
    // warm-up race. One beat later the worker is reliably ready.
    console.warn("SQLite warm-up retry after:", error);
    await new Promise((resolve) => setTimeout(resolve, 400));
    initDatabase();
  }
}

export function initDatabase() {
  getDb().execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS practice_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      date_key TEXT NOT NULL,
      prompt TEXT NOT NULL,
      score INTEGER NOT NULL,
      recognized TEXT NOT NULL,
      correction TEXT NOT NULL,
      feedback_json TEXT NOT NULL,
      strokes_json TEXT
    );
    CREATE TABLE IF NOT EXISTS lesson_progress (
      lesson_id TEXT PRIMARY KEY NOT NULL,
      completed_steps INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  // Second exec keeps each request small: the web SQLite sync bridge times out
  // ("Sync operation timeout") when a single execSync string gets too large.
  getDb().execSync(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      level INTEGER NOT NULL,
      content TEXT NOT NULL,
      romanization TEXT,
      meaning TEXT,
      skill_tags TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS item_srs (
      item_id TEXT PRIMARY KEY NOT NULL,
      ease REAL NOT NULL,
      interval_days INTEGER NOT NULL,
      due_at TEXT NOT NULL,
      reps INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      mastery REAL NOT NULL,
      last_score INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skill_mastery (
      skill TEXT PRIMARY KEY NOT NULL,
      mastery REAL NOT NULL,
      attempts INTEGER NOT NULL,
      last_seen TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS write_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT,
      created_at TEXT NOT NULL,
      date_key TEXT NOT NULL,
      target TEXT NOT NULL,
      recognized TEXT NOT NULL,
      score INTEGER NOT NULL,
      scaffold TEXT NOT NULL,
      breakdown_json TEXT NOT NULL,
      strokes_json TEXT
    );
  `);
  // Third exec: saved canvas pages (the note-app layer). Kept in its own small
  // chunk for the same web sync-bridge reason as above.
  getDb().execSync(`
    CREATE TABLE IF NOT EXISTS canvases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      page_format TEXT NOT NULL,
      strokes_json TEXT NOT NULL
    );
  `);
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseFeedback(value: string): FeedbackResult {
  try {
    return { ...demoFeedback, ...JSON.parse(value) };
  } catch {
    return demoFeedback;
  }
}

export function savePracticeAttempt(input: PracticeAttemptInput) {
  initDatabase();
  const createdAt = new Date().toISOString();
  getDb().runSync(
    `INSERT INTO practice_attempts
      (created_at, date_key, prompt, score, recognized, correction, feedback_json, strokes_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    createdAt,
    todayKey(),
    input.prompt,
    Math.max(0, Math.min(100, Math.round(input.feedback.score || 0))),
    input.feedback.recognized || "",
    input.feedback.correction || "",
    JSON.stringify(input.feedback),
    input.strokes ? JSON.stringify(input.strokes) : null,
  );
}

export function recordQuizResult(quizId: string, score: number, total: number) {
  initDatabase();
  getDb().runSync(
    "INSERT INTO quiz_results (quiz_id, score, total, created_at) VALUES (?, ?, ?, ?)",
    quizId,
    score,
    total,
    new Date().toISOString(),
  );
}

export function getRecentPracticeFeedbacks(limit = 8): FeedbackHistoryItem[] {
  initDatabase();
  const rows = getDb().getAllSync<AttemptRow>(
    "SELECT * FROM practice_attempts ORDER BY created_at DESC LIMIT ?",
    Math.max(1, Math.min(30, Math.round(limit))),
  );

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    prompt: row.prompt,
    score: row.score,
    correction: row.correction,
    feedback: parseFeedback(row.feedback_json),
  }));
}

export function getDashboardSnapshot(): DashboardSnapshot {
  initDatabase();
  const attempts = getDb().getFirstSync<CountRow>("SELECT COUNT(*) AS count FROM practice_attempts")?.count ?? 0;
  const todayCount =
    getDb().getFirstSync<CountRow>("SELECT COUNT(*) AS count FROM practice_attempts WHERE date_key = ?", todayKey())?.count ??
    0;
  const averageScore =
    getDb().getFirstSync<AvgRow>("SELECT AVG(score) AS average_score FROM practice_attempts")?.average_score ?? 0;
  const rows = getDb().getAllSync<AttemptRow>(
    "SELECT * FROM practice_attempts ORDER BY created_at DESC LIMIT 6",
  );
  const recent = rows[0] ? parseFeedback(rows[0].feedback_json) : null;

  return {
    attempts,
    sentences: attempts,
    averageScore: attempts ? Math.round(averageScore) : 0,
    todayCount,
    streak: calculateStreak(),
    totalMinutes: attempts ? attempts * 4 : 0,
    recentFeedback: recent,
    history: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      prompt: row.prompt,
      score: row.score,
      correction: row.correction,
    })),
  };
}

function calculateStreak() {
  const rows = getDb().getAllSync<{ date_key: string }>(
    "SELECT DISTINCT date_key FROM practice_attempts ORDER BY date_key DESC LIMIT 90",
  );
  if (!rows.length) return 0;
  let streak = 0;
  const cursor = new Date();
  const active = new Set(rows.map((row) => row.date_key));
  while (active.has(todayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---- Adaptive learning loop: items / SRS / skills (see docs/PRD-adaptive-learning-loop.md) ----

type SrsRow = {
  item_id: string;
  ease: number;
  interval_days: number;
  due_at: string;
  reps: number;
  lapses: number;
  mastery: number;
  last_score: number;
  updated_at: string;
};

function rowToSrs(row: SrsRow): SrsState {
  return {
    itemId: row.item_id,
    ease: row.ease,
    intervalDays: row.interval_days,
    dueAt: row.due_at,
    reps: row.reps,
    lapses: row.lapses,
    mastery: row.mastery,
    lastScore: row.last_score,
    updatedAt: row.updated_at,
  };
}

export function getCurriculumItems(): LearnItem[] {
  // Authored + AI-generated items live in memory; the DB only tracks state (SRS /
  // skills / attempt counts), all ASCII/numeric. Reading Korean content back
  // through the sync SQLite API wedges the web SharedArrayBuffer bridge.
  return [...curriculum, ...getGeneratedItems()];
}

export function getSrsStates(): Map<string, SrsState> {
  initDatabase();
  const rows = getDb().getAllSync<SrsRow>("SELECT * FROM item_srs");
  return new Map(rows.map((row) => [row.item_id, rowToSrs(row)]));
}

export function getSkillProfile(): SkillMastery[] {
  initDatabase();
  const rows = getDb().getAllSync<{ skill: string; mastery: number; attempts: number; last_seen: string }>(
    "SELECT * FROM skill_mastery",
  );
  const map = new Map(rows.map((row) => [row.skill, row]));
  return SKILL_KEYS.map((skill) => {
    const row = map.get(skill);
    return { skill, mastery: row?.mastery ?? 0, attempts: row?.attempts ?? 0, lastSeen: row?.last_seen ?? "" };
  });
}

export function recordWriteAttempt(
  item: LearnItem,
  grade: GradeResult,
  scaffold: ScaffoldLevel,
  strokes?: Stroke[],
  now = Date.now(),
) {
  initDatabase();
  const db = getDb();
  const createdAt = new Date(now).toISOString();

  db.runSync(
    `INSERT INTO write_attempts (item_id, created_at, date_key, target, recognized, score, scaffold, breakdown_json, strokes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    createdAt,
    todayKey(new Date(now)),
    item.content,
    grade.recognized,
    grade.score,
    scaffold,
    JSON.stringify({ perCharacter: grade.perCharacter, perSkill: grade.perSkill }),
    strokes ? JSON.stringify(strokes) : null,
  );

  // SRS: schedule the item from this score.
  const prevRow = db.getFirstSync<SrsRow>("SELECT * FROM item_srs WHERE item_id = ?", item.id);
  const next = reviewItem(prevRow ? rowToSrs(prevRow) : null, item.id, grade.score, now);
  db.runSync(
    `INSERT INTO item_srs (item_id, ease, interval_days, due_at, reps, lapses, mastery, last_score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       ease=excluded.ease, interval_days=excluded.interval_days, due_at=excluded.due_at,
       reps=excluded.reps, lapses=excluded.lapses, mastery=excluded.mastery,
       last_score=excluded.last_score, updated_at=excluded.updated_at`,
    next.itemId,
    next.ease,
    next.intervalDays,
    next.dueAt,
    next.reps,
    next.lapses,
    next.mastery,
    next.lastScore,
    next.updatedAt,
  );

  // Skill profile: only the skills this item exercises, smoothed toward the grade.
  for (const skill of item.skillTags) {
    const target = (grade.perSkill[skill] ?? 0) / 100;
    const prev = db.getFirstSync<{ mastery: number; attempts: number }>(
      "SELECT mastery, attempts FROM skill_mastery WHERE skill = ?",
      skill,
    );
    const mastery = prev ? prev.mastery * 0.7 + target * 0.3 : target;
    const attempts = (prev?.attempts ?? 0) + 1;
    db.runSync(
      `INSERT INTO skill_mastery (skill, mastery, attempts, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(skill) DO UPDATE SET mastery=excluded.mastery, attempts=excluded.attempts, last_seen=excluded.last_seen`,
      skill,
      mastery,
      attempts,
      createdAt,
    );
  }
}

function calculateWriteStreak(now: number) {
  const rows = getDb().getAllSync<{ date_key: string }>(
    "SELECT DISTINCT date_key FROM write_attempts ORDER BY date_key DESC LIMIT 90",
  );
  if (!rows.length) return 0;
  let streak = 0;
  const cursor = new Date(now);
  const active = new Set(rows.map((row) => row.date_key));
  while (active.has(todayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export type LearningProgress = {
  totalItems: number;
  seenItems: number;
  dueCount: number;
  todayCount: number;
  streak: number;
  skills: SkillMastery[];
  levels: { level: number; type: LearnItem["type"]; title: string; total: number; seen: number; mastery: number }[];
};

export type RecentAttempt = { id: number; itemId: string | null; score: number; createdAt: string; scaffold: string };

// Selects only ASCII/numeric columns (never the Korean target/breakdown), so the
// sync read is safe on web. Map itemId -> in-memory curriculum for display.
export function getRecentWriteAttempts(limit = 8): RecentAttempt[] {
  initDatabase();
  const rows = getDb().getAllSync<{ id: number; item_id: string | null; score: number; created_at: string; scaffold: string }>(
    "SELECT id, item_id, score, created_at, scaffold FROM write_attempts ORDER BY created_at DESC LIMIT ?",
    Math.max(1, Math.min(30, Math.round(limit))),
  );
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    score: row.score,
    createdAt: row.created_at,
    scaffold: row.scaffold,
  }));
}

export function getLearningProgress(now = Date.now()): LearningProgress {
  initDatabase();
  const items = getCurriculumItems();
  const srs = getSrsStates();
  const seen = [...srs.values()];
  const dueCount = seen.filter((state) => state.reps > 0 && isDue(state, now)).length;
  const todayCount =
    getDb().getFirstSync<CountRow>("SELECT COUNT(*) AS count FROM write_attempts WHERE date_key = ?", todayKey(new Date(now)))
      ?.count ?? 0;

  const levels = LEVELS.map((lv) => {
    const levelItems = items.filter((item) => item.level === lv.level);
    const masteries = levelItems.map((item) => srs.get(item.id)?.mastery ?? 0);
    const mastery = masteries.length ? masteries.reduce((a, b) => a + b, 0) / masteries.length : 0;
    const seenN = levelItems.filter((item) => srs.has(item.id)).length;
    return { ...lv, total: levelItems.length, seen: seenN, mastery };
  });

  return {
    totalItems: items.length,
    seenItems: seen.length,
    dueCount,
    todayCount,
    streak: calculateWriteStreak(now),
    skills: getSkillProfile(),
    levels,
  };
}

// ---- Saved canvas pages (the note-app layer) --------------------------------
// Every free-write page auto-saves here and can be reopened later. All access
// is through the ASYNC API on purpose: a full page of handwriting serializes to
// a large JSON blob, and the web sync bridge (SharedArrayBuffer busy-wait)
// times out on big payloads. The data itself is pure ASCII (numbers/ids).

export type SavedCanvas = {
  id: number;
  createdAt: string;
  updatedAt: string;
  pageFormat: string;
  strokes: Stroke[];
};

type CanvasRow = {
  id: number;
  created_at: string;
  updated_at: string;
  page_format: string;
  strokes_json: string;
};

function rowToCanvas(row: CanvasRow): SavedCanvas {
  let strokes: Stroke[] = [];
  try {
    strokes = JSON.parse(row.strokes_json) ?? [];
  } catch {
    strokes = [];
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pageFormat: row.page_format,
    strokes,
  };
}

/**
 * Items practiced per day (write + free-write attempts) for the activity
 * calendar. ASCII-only aggregate, safe on the web sync bridge.
 */
export function getPracticeActivity(): Map<string, number> {
  initDatabase();
  const map = new Map<string, number>();
  for (const table of ["write_attempts", "practice_attempts"]) {
    const rows = getDb().getAllSync<{ date_key: string; count: number }>(
      `SELECT date_key, COUNT(*) AS count FROM ${table} GROUP BY date_key`,
    );
    for (const row of rows) {
      map.set(row.date_key, (map.get(row.date_key) ?? 0) + row.count);
    }
  }
  return map;
}

export async function listCanvases(limit = 10): Promise<SavedCanvas[]> {
  initDatabase();
  const rows = await getDb().getAllAsync<CanvasRow>(
    "SELECT * FROM canvases ORDER BY updated_at DESC LIMIT ?",
    Math.max(1, Math.min(30, Math.round(limit))),
  );
  return rows.map(rowToCanvas);
}

export async function getCanvas(id: number): Promise<SavedCanvas | null> {
  initDatabase();
  const row = await getDb().getFirstAsync<CanvasRow>("SELECT * FROM canvases WHERE id = ?", id);
  return row ? rowToCanvas(row) : null;
}

/**
 * Insert or update a page. Saving an existing page with no strokes deletes it
 * (an emptied note disappears from the shelf, the way note apps clean up).
 * Returns the page id, or null when the page was deleted / nothing saved.
 */
export async function saveCanvas(
  id: number | null,
  strokes: Stroke[],
  pageFormat: string,
): Promise<number | null> {
  initDatabase();
  const db = getDb();
  const now = new Date().toISOString();

  if (!strokes.length) {
    if (id !== null) await db.runAsync("DELETE FROM canvases WHERE id = ?", id);
    return null;
  }

  const json = JSON.stringify(strokes);
  if (id !== null) {
    await db.runAsync(
      "UPDATE canvases SET updated_at = ?, page_format = ?, strokes_json = ? WHERE id = ?",
      now,
      pageFormat,
      json,
      id,
    );
    return id;
  }
  const result = await db.runAsync(
    "INSERT INTO canvases (created_at, updated_at, page_format, strokes_json) VALUES (?, ?, ?, ?)",
    now,
    now,
    pageFormat,
    json,
  );
  return result.lastInsertRowId;
}
