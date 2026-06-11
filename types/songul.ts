export type LanguageCode = "en" | "ko" | "zh" | "vi" | "ru" | "ja" | "id";

export type WritingTool = "pen" | "marker" | "eraser";
export type EraserMode = "touch" | "stroke";
export type PageFormat = "blank" | "lined" | "grid" | "hangul";

export type StrokePoint = {
  x: number;
  y: number;
  t: number;
  pressure?: number;
};

export type Stroke = {
  id: string;
  tool: WritingTool;
  color: string;
  width: number;
  points: StrokePoint[];
};

export type FeedbackResult = {
  recognized: string;
  correction: string;
  grammar_tip: string;
  issues: string[];
  chips: string[];
  recommendation: string;
  score: number;
};

// ---- Structured grading (adaptive loop; see docs/PRD-adaptive-learning-loop.md) ----
// The fixed skill taxonomy the loop schedules and reports on.
export type SkillKey = "shape" | "stroke_order" | "spacing" | "grammar";

export const SKILL_KEYS: SkillKey[] = ["shape", "stroke_order", "spacing", "grammar"];

export type CharacterGrade = {
  index: number; // position among non-space characters of the target
  char: string;
  ok: boolean;
  shapeOk: boolean;
  strokeOrderOk: boolean;
  issues: SkillKey[];
};

// Target-aware, machine-readable result returned by /api/check (or the mock).
export type GradeResult = {
  score: number; // 0-100 overall
  recognized: string;
  correction: string;
  grammarTip: string;
  recommendation: string;
  perCharacter: CharacterGrade[];
  perSkill: Record<SkillKey, number>; // 0-100 each
};

export type GradeInput = {
  image: string;
  target: string;
  itemType?: ItemType;
};

export type PracticeAttemptInput = {
  prompt: string;
  strokes?: Stroke[];
  feedback: FeedbackResult;
};

export type FeedbackHistoryItem = {
  id: number;
  createdAt: string;
  prompt: string;
  score: number;
  correction: string;
  feedback: FeedbackResult;
};

export type DashboardSnapshot = {
  attempts: number;
  sentences: number;
  averageScore: number;
  todayCount: number;
  streak: number;
  totalMinutes: number;
  recentFeedback: FeedbackResult | null;
  history: {
    id: number;
    createdAt: string;
    prompt: string;
    score: number;
    correction: string;
  }[];
};

export type AppSettings = {
  language: LanguageCode;
  darkMode: boolean;
  name: string;
  dailyGoal: number;
  reminders: boolean;
  tracingGuide: boolean;
  saveWriting: boolean;
  penFocus: boolean;
  eraserMode: EraserMode;
  pageFormat: PageFormat;
};

// ---- Curriculum / mastery model (adaptive loop) ----
export type ItemType = "jamo" | "syllable" | "word" | "sentence";

export type LearnItem = {
  id: string;
  type: ItemType;
  level: number; // curriculum level (1..N)
  content: string; // the target string to write
  romanization?: string;
  meaning?: string; // for words/sentences
  skillTags: SkillKey[]; // which skills this item exercises
  source: "authored" | "generated";
};

export type SrsState = {
  itemId: string;
  ease: number; // SM-2 ease factor
  intervalDays: number;
  dueAt: string; // ISO
  reps: number;
  lapses: number;
  mastery: number; // 0-1
  lastScore: number;
  updatedAt: string;
};

export type SkillMastery = {
  skill: SkillKey;
  mastery: number; // 0-1
  attempts: number;
  lastSeen: string;
};

export type ScaffoldLevel = "trace" | "reference" | "memory";

export type QueueKind = "new" | "due" | "drill";
export type QueueEntry = {
  item: LearnItem;
  kind: QueueKind;
  scaffold: ScaffoldLevel;
};
