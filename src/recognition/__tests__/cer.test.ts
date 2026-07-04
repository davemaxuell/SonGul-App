import { describe, expect, it } from 'vitest';
import { cer, editDistance } from '../cer';

describe('editDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(editDistance('한국어', '한국어')).toBe(0);
    expect(editDistance('한국어', '한글어')).toBe(1);
    expect(editDistance('', '가나')).toBe(2);
  });
});

describe('cer', () => {
  it('is 0 for a perfect match and 1 cap for garbage', () => {
    expect(cer('안녕하세요', '안녕하세요')).toBe(0);
    expect(cer('가', '완전다른긴문장')).toBe(1);
  });
  it('normalizes whitespace', () => {
    expect(cer('한국어  공부', '한국어 공부')).toBe(0);
  });
  it('scores partial errors', () => {
    expect(cer('안녕하세요', '안녕하세오')).toBeCloseTo(0.2);
  });
});
