import { describe, expect, it } from 'vitest';
import { maskDob, maskPhone } from '../src/lib/utils';

describe('maskDob', () => {
  it('masks day/month, keeps year', () => {
    expect(maskDob('1990-05-12')).toBe('**/**/1990');
  });
  it('handles empty', () => {
    expect(maskDob('')).toBe('');
    expect(maskDob(null)).toBe('');
  });
  it('falls back for malformed input', () => {
    expect(maskDob('not-a-date')).toBe('**/**/****');
  });
});

describe('maskPhone', () => {
  it('formats VN mobile number with leading 0 as (+84)*******123', () => {
    // "0903123456" -> strip leading 0 -> "903123456" (9 digits) -> mask all but last 3
    expect(maskPhone('0903123456')).toBe('(+84)******456');
  });

  it('does not duplicate an existing +84 or 84 prefix', () => {
    expect(maskPhone('+84903123456')).toBe('(+84)******456');
    expect(maskPhone('84903123456')).toBe('(+84)******456');
  });

  it('handles short numbers', () => {
    expect(maskPhone('12')).toBe('(+84)**');
  });

  it('handles empty', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBe('');
  });
});
