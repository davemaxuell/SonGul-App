import type { FeedbackResult } from "@/types/songul";

export const heroStats = [
  { value: "92%", labelKey: "hero.stat1", fallback: "avg. accuracy" },
  { value: "12", labelKey: "hero.stat2", fallback: "day streaks" },
  { value: "1", labelKey: "hero.stat3", fallback: "tap AI feedback" },
];

export const productCards = [
  {
    titleKey: "hc.t1",
    fallbackTitle: "Writes the way you do",
    labelKey: "hc.k1",
    fallbackLabel: "손글씨 인식 - Handwriting",
    descriptionKey: "hc.d1",
    fallbackDescription: "Draw Hangul by hand - SonGul reads your real strokes, not typed text.",
    chip: "저는 학생이에요.",
    accent: "#3F51D6",
  },
  {
    titleKey: "hc.t2",
    fallbackTitle: "Knows exactly what to fix",
    labelKey: "hc.k2",
    fallbackLabel: "즉각 피드백 - Instant feedback",
    descriptionKey: "hc.d2",
    fallbackDescription: "Letter shape, stroke order, spacing, and grammar - pinpointed in one tap.",
    chip: "은 / 는",
    accent: "#E0922B",
  },
  {
    titleKey: "hc.t3",
    fallbackTitle: "Grows together with you",
    labelKey: "hc.k3",
    fallbackLabel: "학습 경로 - Learning path",
    descriptionKey: "hc.d3",
    fallbackDescription: "From your very first jamo to writing your own Korean diary.",
    chip: "ㄱ ㄴ ㄷ -> 일기",
    accent: "#2FA8A8",
  },
  {
    titleKey: "hc.t4",
    fallbackTitle: "See yourself improve",
    labelKey: "hc.k4",
    fallbackLabel: "성장 추적 - Progress",
    descriptionKey: "hc.d4",
    fallbackDescription: "Accuracy climbs across sessions; weak characters return for review.",
    chip: "72% -> 92%",
    accent: "#3F9B66",
  },
];

export const howSteps = [
  ["how.s1t", "단어 선택 - Choose a word or sentence", "how.s1d", "Pick a prompt - a single jamo, a word, or a full sentence."],
  ["how.s2t", "손으로 쓰기 - Write it by hand", "how.s2d", "Trace it on the canvas with a stylus, finger, or mouse."],
  ["how.s3t", "AI 분석 - AI analyzes it", "how.s3d", "SonGul reads your text, then checks shape, stroke order, spacing and grammar."],
  ["how.s4t", "교정 & 다음 연습 - Correction & next practice", "how.s4d", "Get a clear fix with reasons, then practice the exact thing you missed."],
] as const;

export const featureCards = [
  ["feat.c1t", "글자 모양 교정 - Fix letter shape", "feat.c1d", "See exactly which Hangul strokes need improving, with the model shape side by side."],
  ["feat.c2t", "획순 안내 - Learn stroke order", "feat.c2d", "Get the right order for each character, like ㄱ: left-to-right, then down."],
  ["feat.c3t", "띄어쓰기 점검 - Master spacing", "feat.c3d", "Catch missing or extra spaces, like spacing after the topic particles 은/는."],
  ["feat.c4t", "문법 & 자연스러움 - Grammar & naturalness", "feat.c4d", "Understand why a sentence is corrected - particles, endings, and word choice."],
  ["feat.c5t", "약점 추적 - Track your weak points", "feat.c5d", "SonGul remembers patterns like confusing ㅂ and ㅁ, and brings them back."],
  ["feat.c6t", "성장 확인 - See your progress", "feat.c6d", "Watch accuracy climb across sessions, with weak characters surfaced for review."],
] as const;

export const lessons = [
  {
    title: "Step 1 - Jamo",
    prompt: "가 나 다 라 마",
    focus: "Basic consonant and vowel shapes",
    vocab: [["ㄱ", "giyeok"], ["ㄴ", "nieun"], ["ㅏ", "a"]],
  },
  {
    title: "Step 2 - Learn",
    prompt: "친구랑 영화 봤어요.",
    focus: "-았/었어요 - past tense",
    vocab: [["학교", "school"], ["영화", "movie"], ["친구", "friend"]],
  },
  {
    title: "Step 3 - Build",
    prompt: "학교에 가요.",
    focus: "장소 + 에 - where you go",
    vocab: [["도서관", "library"], ["공원", "park"], ["식당", "restaurant"]],
  },
  {
    title: "Step 4 - Write",
    prompt: "오늘 날씨가 좋았어요.",
    focus: "Diary writing",
    vocab: [["날씨", "weather"], ["기분", "mood"], ["주말", "weekend"]],
  },
];

export const focusAreas = [
  { label: "ㅂ / ㅁ", detail: "often confused; review the shapes" },
  { label: "은 / 는", detail: "spacing after the topic particle" },
  { label: "받침", detail: "final consonants drift too low" },
];

export const vocabulary = [
  ["학교", "school"],
  ["영화", "movie"],
  ["친구", "friend"],
  ["도서관", "library"],
  ["날씨", "weather"],
  ["일기", "diary"],
  ["공원", "park"],
  ["식당", "restaurant"],
];

export const quizzes = [
  {
    id: "past",
    title: "과거 시제 - Past tense",
    questions: [
      { q: "저는 어제 학교에 ___. (가다)", answers: ["가요", "갔어요", "갈 거예요"], correct: 1 },
      { q: "Which is the past-tense ending?", answers: ["-(으)ㄹ게요", "-았/었어요", "-고 있어요"], correct: 1 },
      { q: "먹다 -> 어제 점심을 ___", answers: ["먹어요", "먹었어요", "먹을래요"], correct: 1 },
    ],
  },
  {
    id: "place",
    title: "장소 조사 - Location 에",
    questions: [
      { q: "학교___ 가요.", answers: ["에", "를", "도"], correct: 0 },
      { q: "공원___ 산책해요.", answers: ["에서", "를", "의"], correct: 0 },
      { q: "'에' marks...", answers: ["the object", "a place / destination", "the topic"], correct: 1 },
    ],
  },
  {
    id: "badchim",
    title: "받침 - Final consonants",
    questions: [
      { q: "'밥' 의 받침은?", answers: ["ㅁ", "ㅂ", "ㅅ"], correct: 1 },
      { q: "받침 ㄱ is closest to...", answers: ["a 'k' stop", "ng", "l"], correct: 0 },
      { q: "'꽃' 의 받침은?", answers: ["ㅈ", "ㅊ", "ㅎ"], correct: 1 },
    ],
  },
];

export const demoFeedback: FeedbackResult = {
  recognized: "친구랑 영화 봤어요.",
  correction: "친구랑 영화 봤어요.",
  grammar_tip: "과거 시제 -았/었어요를 자연스럽게 사용했어요.",
  issues: ["Keep the final ㅇ in 랑 round and closed.", "Leave a small gap between words."],
  chips: ["Recognizable sentence", "Spacing is improving"],
  recommendation: "Practice ㅇ and spacing with three short diary sentences.",
  score: 82,
};
