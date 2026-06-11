// =============================================================================
// [DEMO-DATA] ⚠️ FAKE DATA — DELETE WHEN THE BACKEND LANDS ⚠️
// =============================================================================
// A hand-authored bank of AI-coach writing exercises. This stands in for the
// future /api/coach endpoint (real Gemini generation); swapping it out should
// be a one-function change in the screen that consumes it. Pure in-memory —
// nothing here goes near SQLite.
//
// To remove the demo layer: delete this file and grep for "[DEMO-DATA]".
// =============================================================================

export type CoachExerciseType =
  | "topic" // recommend a topic to write about
  | "reading" // example paragraph + comprehension questions
  | "dialogue" // complete the conversation
  | "fill_blank" // fill in the blanks
  | "transform" // rewrite sentences (tense / politeness)
  | "translate" // translate into Korean
  | "dictation"; // listen (TTS) and write what you hear

// One renderer (components/worksheet.tsx) typesets all of these.
export type WorksheetBlock =
  | { kind: "heading"; ko: string; en: string }
  | { kind: "paragraph"; ko: string; en?: string }
  | { kind: "question"; n: number; ko?: string; en?: string; lines?: number }
  | { kind: "dialogue"; speaker: string; ko?: string; en?: string; blank?: boolean }
  | { kind: "cloze"; segments: { t: string; blank?: boolean }[]; en?: string }
  | { kind: "wordbank"; words: string[] }
  | { kind: "hint"; text: string }
  | { kind: "lines"; n: number };

export type CoachExercise = {
  id: string;
  type: CoachExerciseType;
  title: string;
  level: "beginner" | "intermediate";
  instructions: string;
  blocks: WorksheetBlock[];
  /** Spoken (never printed) text for listening exercises — played from the
      coach rail's speaker button, so the worksheet stays pointer-transparent. */
  audio?: string;
};

export const coachExerciseTypes: {
  type: CoachExerciseType;
  title: string;
  description: string;
}[] = [
  { type: "topic", title: "Topic spark", description: "A theme to free-write about, with a word bank." },
  { type: "reading", title: "Read & answer", description: "A short paragraph, then questions to answer in writing." },
  { type: "dialogue", title: "Finish the dialogue", description: "Write the missing half of a conversation." },
  { type: "fill_blank", title: "Fill in the blanks", description: "Complete sentences with the missing particle or verb." },
  { type: "transform", title: "Rewrite it", description: "Change tense or politeness, keep the meaning." },
  { type: "translate", title: "Translate", description: "Turn English sentences into written Korean." },
  { type: "dictation", title: "Dictation", description: "Listen with the speaker button, write what you hear." },
];

export const coachExercises: CoachExercise[] = [
  // ---- Topic sparks -------------------------------------------------------
  {
    id: "coach-topic-1",
    type: "topic",
    title: "Topic spark",
    level: "beginner",
    instructions: "Write 3 short sentences about your weekend, below the prompt.",
    blocks: [
      { kind: "heading", ko: "주말에 뭐 해요?", en: "What are you doing this weekend?" },
      { kind: "hint", text: "Try: where you go (—에 가요), who you go with (—랑), and one feeling." },
      { kind: "wordbank", words: ["공원", "친구", "영화", "같이", "재미있어요"] },
      { kind: "lines", n: 4 },
    ],
  },
  {
    id: "coach-topic-2",
    type: "topic",
    title: "Topic spark",
    level: "beginner",
    instructions: "Describe your favorite food in 3 sentences.",
    blocks: [
      { kind: "heading", ko: "제일 좋아하는 음식", en: "My favorite food" },
      { kind: "hint", text: "Name it, say how it tastes (매워요 / 달아요), and how often you eat it (자주 / 가끔)." },
      { kind: "wordbank", words: ["김치찌개", "맵다", "자주", "먹다", "제일"] },
      { kind: "lines", n: 4 },
    ],
  },
  {
    id: "coach-topic-3",
    type: "topic",
    title: "Topic spark",
    level: "intermediate",
    instructions: "Write your morning routine in order. Connect actions with —고.",
    blocks: [
      { kind: "heading", ko: "나의 아침", en: "My morning" },
      { kind: "hint", text: "일어나다 → 씻다 → 아침을 먹다 → 집을 나가다. Example: 일어나고 씻어요." },
      { kind: "wordbank", words: ["일어나다", "씻다", "아침", "먹다", "나가다"] },
      { kind: "lines", n: 5 },
    ],
  },

  // ---- Reading comprehension ---------------------------------------------
  {
    id: "coach-reading-1",
    type: "reading",
    title: "Read & answer",
    level: "beginner",
    instructions: "Read about Minsu's day, then answer each question in Korean.",
    blocks: [
      {
        kind: "paragraph",
        ko: "민수는 매일 아침 일곱 시에 일어나요. 학교에 가기 전에 우유를 마셔요. 학교에서 친구들과 점심을 먹어요.",
        en: "Minsu gets up at seven every morning. Before school he drinks milk. At school he has lunch with his friends.",
      },
      { kind: "question", n: 1, ko: "민수는 몇 시에 일어나요?", en: "What time does Minsu get up?", lines: 1 },
      { kind: "question", n: 2, ko: "학교에 가기 전에 뭘 마셔요?", en: "What does he drink before school?", lines: 1 },
      { kind: "question", n: 3, ko: "누구랑 점심을 먹어요?", en: "Who does he eat lunch with?", lines: 1 },
    ],
  },
  {
    id: "coach-reading-2",
    type: "reading",
    title: "Read & answer",
    level: "intermediate",
    instructions: "Read about Sujin's weekend, then answer in full sentences.",
    blocks: [
      {
        kind: "paragraph",
        ko: "지난 주말에 수진 씨는 가족이랑 바다에 갔어요. 날씨가 아주 좋았어요. 수진 씨는 사진을 많이 찍었어요.",
        en: "Last weekend Sujin went to the sea with her family. The weather was great. She took lots of photos.",
      },
      { kind: "question", n: 1, ko: "수진 씨는 어디에 갔어요?", en: "Where did Sujin go?", lines: 1 },
      { kind: "question", n: 2, ko: "날씨가 어땠어요?", en: "How was the weather?", lines: 1 },
      { kind: "question", n: 3, ko: "수진 씨는 뭘 많이 했어요?", en: "What did she do a lot of?", lines: 1 },
    ],
  },

  // ---- Dialogue completion ------------------------------------------------
  {
    id: "coach-dialogue-1",
    type: "dialogue",
    title: "Finish the dialogue",
    level: "beginner",
    instructions: "You are at a café. Write B's lines to order something.",
    blocks: [
      { kind: "dialogue", speaker: "A", ko: "어서 오세요! 뭐 드릴까요?", en: "Welcome! What can I get you?" },
      { kind: "dialogue", speaker: "B", blank: true, en: "(Order a drink.)" },
      { kind: "dialogue", speaker: "A", ko: "네, 사이즈는요?", en: "Sure — what size?" },
      { kind: "dialogue", speaker: "B", blank: true, en: "(Answer, and say thank you.)" },
      { kind: "hint", text: "— 주세요 means “please give me —”. 커피, 주스, 차…" },
    ],
  },
  {
    id: "coach-dialogue-2",
    type: "dialogue",
    title: "Finish the dialogue",
    level: "intermediate",
    instructions: "A friend suggests weekend plans. Write B's replies.",
    blocks: [
      { kind: "dialogue", speaker: "A", ko: "주말에 시간 있어요?", en: "Do you have time this weekend?" },
      { kind: "dialogue", speaker: "B", blank: true, en: "(Say yes or no, and why.)" },
      { kind: "dialogue", speaker: "A", ko: "그럼 같이 영화 볼까요?", en: "Then shall we watch a movie together?" },
      { kind: "dialogue", speaker: "B", blank: true, en: "(Accept, or suggest something else.)" },
      { kind: "hint", text: "좋아요 = sounds good · —ㄹ까요? = shall we…? · 다음에 = next time" },
    ],
  },

  // ---- Fill in the blanks -------------------------------------------------
  {
    id: "coach-blank-1",
    type: "fill_blank",
    title: "Fill in the blanks",
    level: "beginner",
    instructions: "Write the missing particle in each gap. Use the word bank.",
    blocks: [
      { kind: "wordbank", words: ["에", "랑", "을", "가"] },
      { kind: "cloze", segments: [{ t: "저는 학교" }, { t: "에", blank: true }, { t: " 가요." }], en: "I go to school." },
      { kind: "cloze", segments: [{ t: "친구" }, { t: "랑", blank: true }, { t: " 영화를 봐요." }], en: "I watch a movie with a friend." },
      { kind: "cloze", segments: [{ t: "물" }, { t: "을", blank: true }, { t: " 주세요." }], en: "Water, please." },
      { kind: "cloze", segments: [{ t: "날씨" }, { t: "가", blank: true }, { t: " 좋아요." }], en: "The weather is nice." },
    ],
  },
  {
    id: "coach-blank-2",
    type: "fill_blank",
    title: "Fill in the blanks",
    level: "beginner",
    instructions: "Write each verb in the past tense (—았/었어요).",
    blocks: [
      { kind: "cloze", segments: [{ t: "어제 친구를 " }, { t: "만났어요", blank: true }, { t: "." }], en: "(만나다 — to meet)" },
      { kind: "cloze", segments: [{ t: "아침에 빵을 " }, { t: "먹었어요", blank: true }, { t: "." }], en: "(먹다 — to eat)" },
      { kind: "cloze", segments: [{ t: "주말에 공원에 " }, { t: "갔어요", blank: true }, { t: "." }], en: "(가다 — to go)" },
    ],
  },
  {
    id: "coach-blank-3",
    type: "fill_blank",
    title: "Fill in the blanks",
    level: "intermediate",
    instructions: "Connect each pair with the right linking word.",
    blocks: [
      { kind: "wordbank", words: ["그래서", "그런데", "그리고"] },
      { kind: "cloze", segments: [{ t: "비가 와요. " }, { t: "그래서", blank: true }, { t: " 우산을 가져가요." }], en: "It's raining. So I take an umbrella." },
      { kind: "cloze", segments: [{ t: "한국어는 어려워요. " }, { t: "그런데", blank: true }, { t: " 재미있어요." }], en: "Korean is hard. But it's fun." },
      { kind: "cloze", segments: [{ t: "책을 읽어요. " }, { t: "그리고", blank: true }, { t: " 일기를 써요." }], en: "I read a book. And I write a diary." },
    ],
  },

  // ---- Transformations ----------------------------------------------------
  {
    id: "coach-transform-1",
    type: "transform",
    title: "Rewrite it",
    level: "beginner",
    instructions: "Rewrite each sentence in the past tense.",
    blocks: [
      { kind: "question", n: 1, ko: "학교에 가요.", en: "→ yesterday", lines: 1 },
      { kind: "question", n: 2, ko: "밥을 먹어요.", en: "→ this morning", lines: 1 },
      { kind: "question", n: 3, ko: "책을 읽어요.", en: "→ last night", lines: 1 },
      { kind: "hint", text: "가요 → 갔어요 · 먹어요 → 먹었어요 · 읽어요 → 읽었어요" },
    ],
  },
  {
    id: "coach-transform-2",
    type: "transform",
    title: "Rewrite it",
    level: "intermediate",
    instructions: "These lines are casual (반말). Rewrite them politely (—요).",
    blocks: [
      { kind: "question", n: 1, ko: "고마워.", en: "Thanks.", lines: 1 },
      { kind: "question", n: 2, ko: "잘 가.", en: "Bye (lit. go well).", lines: 1 },
      { kind: "question", n: 3, ko: "뭐 해?", en: "What are you doing?", lines: 1 },
    ],
  },

  // ---- Translation --------------------------------------------------------
  {
    id: "coach-translate-1",
    type: "translate",
    title: "Translate",
    level: "beginner",
    instructions: "Write each sentence in Korean.",
    blocks: [
      { kind: "question", n: 1, en: "I drink coffee every morning.", lines: 1 },
      { kind: "question", n: 2, en: "The weather is cold today.", lines: 1 },
      { kind: "hint", text: "매일 아침 = every morning · 춥다 = to be cold" },
    ],
  },
  {
    id: "coach-translate-2",
    type: "translate",
    title: "Translate",
    level: "intermediate",
    instructions: "Write each sentence in Korean.",
    blocks: [
      { kind: "question", n: 1, en: "I want to travel to Korea next year.", lines: 1 },
      { kind: "question", n: 2, en: "My friend speaks Korean well.", lines: 1 },
      { kind: "hint", text: "—고 싶어요 = want to · 잘 = well · 내년 = next year" },
    ],
  },

  // ---- Dictation (listen & write) -----------------------------------------
  {
    id: "coach-dictation-1",
    type: "dictation",
    title: "Dictation",
    level: "beginner",
    instructions: "Tap the speaker in the coach rail, listen, and write the sentence you hear.",
    audio: "오늘 날씨가 좋아요.",
    blocks: [
      { kind: "heading", ko: "받아쓰기", en: "Dictation — listen, then write" },
      { kind: "hint", text: "Play it as many times as you need. Listen for the spaces between words." },
      { kind: "lines", n: 3 },
    ],
  },
  {
    id: "coach-dictation-2",
    type: "dictation",
    title: "Dictation",
    level: "intermediate",
    instructions: "Tap the speaker in the coach rail, listen, and write the sentence you hear.",
    audio: "주말에 친구를 만나요.",
    blocks: [
      { kind: "heading", ko: "받아쓰기", en: "Dictation — listen, then write" },
      { kind: "hint", text: "One particle hides after a vowel sound — trust your ear (를)." },
      { kind: "lines", n: 3 },
    ],
  },
];

const byType = new Map<CoachExerciseType, CoachExercise[]>();
for (const exercise of coachExercises) {
  const bank = byType.get(exercise.type) ?? [];
  bank.push(exercise);
  byType.set(exercise.type, bank);
}

const cursors = new Map<string, number>();

/**
 * [DEMO-DATA] Deal the next exercise of a type (or any type for "surprise").
 * Cycles through the bank so "Another one" always changes the sheet. This is
 * the function a real /api/coach call will replace.
 */
export function dealCoachExercise(type?: CoachExerciseType): CoachExercise {
  const bank = (type ? byType.get(type) : coachExercises) ?? coachExercises;
  const key = type ?? "any";
  const n = cursors.get(key) ?? 0;
  cursors.set(key, n + 1);
  return bank[n % bank.length];
}
