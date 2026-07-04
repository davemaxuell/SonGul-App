import { describe, expect, it } from 'vitest';
import { jamoIncludes, toJamo } from '../jamo';

describe('toJamo', () => {
  it('decomposes syllables', () => {
    expect(toJamo('한')).toBe('ㅎㅏㄴ');
    expect(toJamo('가')).toBe('ㄱㅏ');
  });
  it('passes through non-Hangul, lowercased', () => {
    expect(toJamo('Abc 한')).toBe('abc ㅎㅏㄴ');
  });
});

describe('jamoIncludes', () => {
  it('matches partial syllables', () => {
    expect(jamoIncludes('한국어 공부', '하')).toBe(true);
    expect(jamoIncludes('한국어 공부', '한국')).toBe(true);
  });
  it('rejects non-matches and empty queries', () => {
    expect(jamoIncludes('한국어', '헌')).toBe(false);
    expect(jamoIncludes('한국어', '  ')).toBe(false);
  });
});
