// Authored seed curriculum for the adaptive loop (M1). Levels ramp jamo ->
// syllables -> words -> sentences. AI-generated items (M5) extend levels 3-4 at
// runtime; this is the hand-authored base where order/pedagogy matter most.
// IDs are stable (`type:content`) so SRS state survives rebuilds.
import type { LearnItem, SkillKey } from "@/types/songul";

function build(
  type: LearnItem["type"],
  level: number,
  rows: [content: string, romanization: string, meaning?: string][],
  skillTags: SkillKey[],
): LearnItem[] {
  return rows.map(([content, romanization, meaning], i) => ({
    id: `${type}-${i}`, // ASCII id (no Korean) — Korean in ids/content breaks the web SQLite sync bridge
    type,
    level,
    content,
    romanization,
    meaning,
    skillTags,
    source: "authored" as const,
  }));
}

// Level 1 — jamo (consonants then vowels): pure shape + stroke order.
const jamo = build(
  "jamo",
  1,
  [
    ["ㄱ", "giyeok"], ["ㄴ", "nieun"], ["ㄷ", "digeut"], ["ㄹ", "rieul"], ["ㅁ", "mieum"],
    ["ㅂ", "bieup"], ["ㅅ", "siot"], ["ㅇ", "ieung"], ["ㅈ", "jieut"], ["ㅊ", "chieut"],
    ["ㅋ", "kieuk"], ["ㅌ", "tieut"], ["ㅍ", "pieup"], ["ㅎ", "hieut"],
    ["ㅏ", "a"], ["ㅓ", "eo"], ["ㅗ", "o"], ["ㅜ", "u"], ["ㅡ", "eu"], ["ㅣ", "i"],
    ["ㅑ", "ya"], ["ㅕ", "yeo"], ["ㅛ", "yo"], ["ㅠ", "yu"],
  ],
  ["shape", "stroke_order"],
);

// Level 2 — basic CV syllables: blocks come together.
const syllables = build(
  "syllable",
  2,
  [
    ["가", "ga"], ["나", "na"], ["다", "da"], ["라", "ra"], ["마", "ma"],
    ["바", "ba"], ["사", "sa"], ["아", "a"], ["자", "ja"], ["차", "cha"],
    ["고", "go"], ["노", "no"], ["도", "do"], ["로", "ro"], ["모", "mo"],
    ["기", "gi"], ["니", "ni"], ["디", "di"], ["리", "ri"], ["미", "mi"],
  ],
  ["shape", "stroke_order"],
);

// Level 3 — words (some carry 받침 / final consonants).
const words = build(
  "word",
  3,
  [
    ["학교", "hakgyo", "school"], ["영화", "yeonghwa", "movie"], ["친구", "chingu", "friend"],
    ["도서관", "doseogwan", "library"], ["날씨", "nalssi", "weather"], ["일기", "ilgi", "diary"],
    ["공원", "gongwon", "park"], ["식당", "sikdang", "restaurant"], ["학생", "haksaeng", "student"],
    ["선생님", "seonsaengnim", "teacher"],
  ],
  ["shape", "stroke_order"],
);

// Level 4 — sentences: spacing + grammar come into play.
const sentences = build(
  "sentence",
  4,
  [
    ["학교에 가요.", "hakgyo-e gayo", "I go to school."],
    ["친구랑 영화 봤어요.", "chingu-rang yeonghwa bwasseoyo", "I watched a movie with a friend."],
    ["오늘 날씨가 좋았어요.", "oneul nalssiga joatseoyo", "The weather was nice today."],
    ["도서관에서 책을 읽어요.", "doseogwan-eseo chaegeul ilgeoyo", "I read a book at the library."],
    ["주말에 공원에 갔어요.", "jumal-e gongwon-e gatseoyo", "I went to the park on the weekend."],
  ],
  ["spacing", "grammar", "shape"],
);

export const curriculum: LearnItem[] = [...jamo, ...syllables, ...words, ...sentences];

export const LEVELS: { level: number; type: LearnItem["type"]; title: string }[] = [
  { level: 1, type: "jamo", title: "Letters (jamo)" },
  { level: 2, type: "syllable", title: "Syllables" },
  { level: 3, type: "word", title: "Words" },
  { level: 4, type: "sentence", title: "Sentences" },
];
