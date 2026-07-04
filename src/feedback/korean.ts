// SonGul Korean feedback v0 — rule-based checkers for the most common,
// safely-detectable learner errors: spacing (띄어쓰기), particle agreement
// (조사), and frequent misspellings. Rules only fire when the surrounding
// jamo make the error unambiguous, to keep false positives low.
import type { Finding } from '../types';

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** final-consonant (받침) index of a Hangul syllable: 0 = none, 8 = ㄹ */
function batchim(ch: string): number | null {
  const c = ch.codePointAt(0);
  if (c === undefined || c < HANGUL_BASE || c > HANGUL_LAST) return null;
  return (c - HANGUL_BASE) % 28;
}

function hasBatchim(ch: string): boolean {
  const b = batchim(ch);
  return b !== null && b !== 0;
}

interface RuleMatch {
  start: number;
  end: number;
  original: string;
  suggestion: string;
}

type Rule = {
  type: Finding['type'];
  severity: Finding['severity'];
  explanation: string;
  explanationEn: string;
  find: (text: string) => RuleMatch[];
};

function regexRule(
  re: RegExp,
  build: (m: RegExpMatchArray) => { suggestion: string; skip?: boolean } | null
): (text: string) => RuleMatch[] {
  return (text) => {
    const out: RuleMatch[] = [];
    for (const m of text.matchAll(re)) {
      const built = build(m);
      if (!built || built.skip) continue;
      out.push({
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        original: m[0],
        suggestion: built.suggestion,
      });
    }
    return out;
  };
}

const RULES: Rule[] = [
  {
    type: 'spacing',
    severity: 'high',
    explanation:
      "'-(으)ㄹ 수 있다/없다'의 '수'는 의존 명사이므로 앞말과 띄어 씁니다.",
    explanationEn: "'수' in '-(으)ㄹ 수 있다/없다' is a bound noun — write it as a separate word.",
    find: regexRule(/([가-힣])수(있|없)/g, (m) =>
      batchim(m[1]) === 8 ? { suggestion: `${m[1]} 수 ${m[2]}` } : null
    ),
  },
  {
    type: 'spacing',
    severity: 'medium',
    explanation:
      "'수' 앞은 띄어 쓰지만 조사 '밖에'는 '수'에 붙여 써서 '-(으)ㄹ 수밖에'가 됩니다.",
    explanationEn: "Space before '수', but the particle '밖에' attaches to it: '-(으)ㄹ 수밖에'.",
    find: regexRule(/([가-힣])수밖/g, (m) =>
      batchim(m[1]) === 8 ? { suggestion: `${m[1]} 수밖` } : null
    ),
  },
  {
    type: 'spacing',
    severity: 'high',
    explanation: "'것'은 의존 명사이므로 관형형 '-(으)ㄹ' 뒤에서 띄어 씁니다.",
    explanationEn: "'것' is a bound noun — separate it after the '-(으)ㄹ' modifier form.",
    find: regexRule(/([가-힣])것/g, (m) =>
      batchim(m[1]) === 8 ? { suggestion: `${m[1]} 것` } : null
    ),
  },
  {
    type: 'spacing',
    severity: 'high',
    explanation: "'때'는 명사이므로 관형형 '-(으)ㄹ' 뒤에서 띄어 씁니다.",
    explanationEn: "'때' (time/when) is a noun — separate it after the '-(으)ㄹ' modifier form.",
    find: regexRule(/([가-힣])때/g, (m) =>
      batchim(m[1]) === 8 ? { suggestion: `${m[1]} 때` } : null
    ),
  },
  {
    type: 'spacing',
    severity: 'medium',
    explanation: "본용언과 '-지 않다'는 띄어 씁니다.",
    explanationEn: "The negative '-지 않다' is written as a separate word after the verb stem.",
    find: regexRule(/지않/g, () => ({ suggestion: '지 않' })),
  },
  {
    type: 'spacing',
    severity: 'medium',
    explanation: "'-아/어야 하다'의 '하다'는 보조 용언이므로 띄어 씁니다.",
    explanationEn: "In '-아/어야 하다' (have to), '하다' is an auxiliary verb — write it separately.",
    find: regexRule(/([가-힣]야)(하|해|했|한|할|합)/g, (m) => ({
      suggestion: `${m[1]} ${m[2]}`,
    })),
  },
  {
    type: 'spacing',
    severity: 'medium',
    explanation: "'몇'과 단위 명사는 띄어 씁니다. 예: 몇 시, 몇 명, 몇 개.",
    explanationEn: "'몇' (how many) is spaced from its counter word: 몇 시, 몇 명, 몇 개.",
    find: regexRule(/몇(시간|시|명|개|번|살|월|일|달|주)/g, (m) => ({
      suggestion: `몇 ${m[1]}`,
    })),
  },
  {
    type: 'spacing',
    severity: 'medium',
    explanation: "관형사 '이번/다음/저번'과 명사 '주'는 띄어 씁니다.",
    explanationEn: "'이번/다음/저번' are determiners — space them from the noun '주' (week).",
    find: regexRule(/(이번|다음|저번)주/g, (m) => ({ suggestion: `${m[1]} 주` })),
  },
  {
    type: 'spacing',
    severity: 'medium',
    explanation: "수 관형사 '한'과 단위 명사 '달'은 띄어 씁니다.",
    explanationEn: "The numeral '한' is spaced from the counter '달' (month).",
    find: regexRule(/한달/g, () => ({ suggestion: '한 달' })),
  },
  {
    type: 'spacing',
    severity: 'medium',
    explanation: "'밖에'가 '오직 ~뿐'의 뜻인 조사일 때는 앞말에 붙여 씁니다: 수밖에.",
    explanationEn: "As a particle meaning 'only', '밖에' attaches to the previous word: 수밖에.",
    find: regexRule(/수 밖에/g, () => ({ suggestion: '수밖에' })),
  },
  {
    type: 'spelling',
    severity: 'high',
    explanation: "'되-' + '-어'는 '돼'로 줄어듭니다. '됬'은 잘못된 표기이며 '됐'이 맞습니다.",
    explanationEn: "'되 + 어' contracts to '돼'; the past form is '됐', never '됬'.",
    find: regexRule(/됬/g, () => ({ suggestion: '됐' })),
  },
  {
    type: 'spelling',
    severity: 'high',
    explanation: "'되어요'의 준말은 '돼요'입니다. 어간 '되-'에 바로 '-요'를 붙일 수 없습니다.",
    explanationEn: "'되어요' contracts to '돼요' — the stem '되-' cannot take '-요' directly.",
    find: regexRule(/되요(?![가-힣])/g, () => ({ suggestion: '돼요' })),
  },
  {
    type: 'grammar',
    severity: 'high',
    explanation: "받침이 있는 말 뒤에는 목적격 조사 '을'을 씁니다.",
    explanationEn: "After a syllable ending in a consonant (받침), the object particle is '을', not '를'.",
    find: regexRule(/([가-힣])를/g, (m) =>
      hasBatchim(m[1]) ? { suggestion: `${m[1]}을` } : null
    ),
  },
  {
    type: 'grammar',
    severity: 'medium',
    explanation: "받침이 없는 말 뒤에는 목적격 조사 '를'을 씁니다.",
    explanationEn: "After a vowel-final syllable (no 받침), the object particle is '를', not '을'.",
    find: regexRule(/([가-힣])을(?![가-힣])/g, (m) => {
      // common nouns that genuinely end in '을'
      if (m[1] === '마' || m[1] === '노') return null;
      return hasBatchim(m[1]) ? null : { suggestion: `${m[1]}를` };
    }),
  },
  {
    type: 'grammar',
    severity: 'high',
    explanation:
      "받침이 없거나 ㄹ 받침인 말 뒤에는 '로'를 씁니다. '으로'는 그 외의 받침 뒤에만 씁니다.",
    explanationEn: "Use '로' after a vowel or ㄹ; '으로' is only for other consonant finals.",
    find: regexRule(/([가-힣])으로(?![가-힣])/g, (m) => {
      const b = batchim(m[1]);
      return b === 0 || b === 8 ? { suggestion: `${m[1]}로` } : null;
    }),
  },
  {
    type: 'grammar',
    severity: 'medium',
    explanation: "ㄹ 이외의 받침 뒤에는 '으로'를 씁니다.",
    explanationEn: "After a consonant final other than ㄹ, use '으로' instead of '로'.",
    find: regexRule(/([가-힣])로(?![가-힣])/g, (m) => {
      const b = batchim(m[1]);
      return b !== null && b !== 0 && b !== 8 ? { suggestion: `${m[1]}으로` } : null;
    }),
  },
  {
    type: 'grammar',
    severity: 'medium',
    explanation: "받침이 있는 말 뒤에는 '과'를 씁니다.",
    explanationEn: "After a consonant-final syllable, the connective particle is '과', not '와'.",
    find: regexRule(/([가-힣])와(?![가-힣])/g, (m) =>
      hasBatchim(m[1]) ? { suggestion: `${m[1]}과` } : null
    ),
  },
];

export function checkKorean(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    for (const m of rule.find(text)) {
      findings.push({
        type: rule.type,
        severity: rule.severity,
        original: m.original,
        suggestion: m.suggestion,
        explanation: rule.explanation,
        explanationEn: rule.explanationEn,
        start: m.start,
        end: m.end,
      });
    }
  }

  // speech-level consistency (naturalness v0): mixing 합니다체 and 해요체
  const formal = /니다(?![가-힣])/.test(text);
  const polite = /[아어여해]요(?![가-힣])/.test(text);
  if (formal && polite) {
    findings.push({
      type: 'naturalness',
      severity: 'low',
      original: '합니다체 + 해요체',
      suggestion: '한 가지 문체로 통일',
      explanation:
        '한 글 안에서 합니다체와 해요체가 섞여 있습니다. 격식 있는 글(TOPIK 쓰기 등)에서는 문체를 통일하는 것이 자연스럽습니다.',
      explanationEn:
        'Formal (합니다) and polite (해요) styles are mixed. Formal writing such as TOPIK essays should keep one consistent register.',
      start: 0,
      end: 0,
    });
  }

  // sort by position; drop overlapping duplicates
  findings.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Finding[] = [];
  let lastEnd = -1;
  for (const f of findings) {
    if (f.start < lastEnd && f.end <= lastEnd) continue;
    out.push(f);
    lastEnd = Math.max(lastEnd, f.end);
  }
  return out;
}

/** apply findings to text to produce the corrected sentence (client panel and
    server gateway share this so "corrected" always means the same thing) */
export function applyFindings(text: string, findings: Finding[]): string {
  let out = text;
  const spans = findings.filter((f) => f.end > f.start).sort((a, b) => b.start - a.start);
  for (const f of spans) {
    out = out.slice(0, f.start) + f.suggestion + out.slice(f.end);
  }
  return out;
}

export const FINDING_LABELS: Record<Finding['type'], { ko: string; en: string }> = {
  spacing: { ko: '띄어쓰기', en: 'Spacing' },
  grammar: { ko: '문법', en: 'Grammar' },
  spelling: { ko: '맞춤법', en: 'Spelling' },
  naturalness: { ko: '자연스러움', en: 'Naturalness' },
  handwriting: { ko: '글씨 모양', en: 'Handwriting' },
};
