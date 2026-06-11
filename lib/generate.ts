// Adaptive item generation (M5). Produces fresh sentence items that target the
// learner's weak skill once they reach the sentence level, so the path never
// runs out. This is a MOCK (a small template bank); wiring real generation is a
// one-function swap of generateForSkill() to call the server/Gemini.
//
// Generated items live in memory with ASCII ids (`gen-N`) so they never hit the
// web SQLite sync-bridge limits the authored content already dodges.
import type { LearnItem, SkillKey } from "@/types/songul";

type Template = { content: string; romanization: string; meaning: string };

const TEMPLATES: Record<SkillKey, Template[]> = {
  spacing: [
    { content: "주말에 친구를 만나요.", romanization: "jumal-e chingureul mannayo", meaning: "I meet a friend on the weekend." },
    { content: "저는 매일 책을 읽어요.", romanization: "jeoneun maeil chaegeul ilgeoyo", meaning: "I read a book every day." },
  ],
  grammar: [
    { content: "어제 비가 왔어요.", romanization: "eoje biga wasseoyo", meaning: "It rained yesterday." },
    { content: "내일 학교에 갈 거예요.", romanization: "naeil hakgyo-e gal geoyeyo", meaning: "I will go to school tomorrow." },
  ],
  shape: [
    { content: "맑은 하늘을 봐요.", romanization: "malgeun haneureul bwayo", meaning: "I look at the clear sky." },
    { content: "따뜻한 차를 마셔요.", romanization: "ttatteutan chareul masyeoyo", meaning: "I drink warm tea." },
  ],
  stroke_order: [
    { content: "글씨를 천천히 써요.", romanization: "geulssireul cheoncheonhi sseoyo", meaning: "I write the letters slowly." },
    { content: "꽃이 예쁘게 피었어요.", romanization: "kkochi yeppeuge pieosseoyo", meaning: "The flowers bloomed beautifully." },
  ],
};

const generated: LearnItem[] = [];
let counter = 0;

export function getGeneratedItems(): LearnItem[] {
  return generated;
}

export function generateForSkill(skill: SkillKey): LearnItem {
  const bank = TEMPLATES[skill] ?? TEMPLATES.spacing;
  const template = bank[counter % bank.length];
  counter += 1;
  const item: LearnItem = {
    id: `gen-${counter}`,
    type: "sentence",
    level: 4,
    content: template.content,
    romanization: template.romanization,
    meaning: template.meaning,
    // A sentence always exercises spacing + shape; emphasize the targeted skill.
    skillTags: Array.from(new Set<SkillKey>([skill, "spacing", "shape"])),
    source: "generated",
  };
  generated.push(item);
  return item;
}

export function generateBatch(skill: SkillKey, n: number): void {
  for (let i = 0; i < n; i += 1) generateForSkill(skill);
}
