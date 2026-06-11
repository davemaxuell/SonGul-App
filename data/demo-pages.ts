// =============================================================================
// [DEMO-DATA] ⚠️ FAKE DATA — DELETE WHEN THE BACKEND LANDS ⚠️
// =============================================================================
// Mock saved pages so the Home shelf reads as lived-in before the learner has
// five real pages. Typeset (handwriting font), not stroke data: real pages
// always render from real ink and displace these one by one.
//
// To remove: delete this file and grep for "[DEMO-DATA]".
// =============================================================================
import { colors } from "@/constants/theme";

export type DemoPage = {
  id: string;
  korean: string;
  date: Date;
  pageFormat: "blank" | "lined" | "grid" | "hangul";
  ink: string;
};

const ROWS: Array<[korean: string, dayOffset: number, pageFormat: DemoPage["pageFormat"], ink: string]> = [
  ["오늘도 한 줄 썼어요", 1, "lined", colors.ink],
  ["커피 한 잔, 단어 다섯 개", 2, "blank", colors.pen],
  ["비 오는 날의 일기", 3, "lined", colors.teal],
  ["한글 연습 7일째!", 4, "hangul", colors.ink],
  ["주말 계획: 공원, 책, 낮잠", 6, "grid", colors.pen],
];

export const demoPages: DemoPage[] = ROWS.map(([korean, dayOffset, pageFormat, ink], i) => {
  const date = new Date();
  date.setHours(19 - i, 12 + i * 7, 0, 0);
  date.setDate(date.getDate() - dayOffset);
  return { id: `demo-page-${i}`, korean, date, pageFormat, ink };
});
