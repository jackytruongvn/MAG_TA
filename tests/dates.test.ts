import { describe, expect, it } from 'vitest';
import { parseDateOnly, formatDateOnly, isValidDateInput, wallTimeToUtc, tzOffsetMinutes, VN_TZ } from '../src/lib/dates';

describe('parseDateOnly', () => {
  it('parses dd/MM/yyyy', () => {
    expect(parseDateOnly('05/08/2026')).toBe('2026-08-05');
    expect(parseDateOnly('31/12/2025')).toBe('2025-12-31');
  });

  it('parses d/M/yyyy', () => {
    expect(parseDateOnly('5/8/2026')).toBe('2026-08-05');
    expect(parseDateOnly('1/1/2026')).toBe('2026-01-01');
  });

  it('parses dd-MMM-yyyy', () => {
    expect(parseDateOnly('05-Aug-2026')).toBe('2026-08-05');
    expect(parseDateOnly('5-aug-2026')).toBe('2026-08-05');
    expect(parseDateOnly('17 Sep 2025')).toBe('2025-09-17');
  });

  it('parses yyyy-MM-dd (already ISO)', () => {
    expect(parseDateOnly('2026-08-05')).toBe('2026-08-05');
    expect(parseDateOnly('2026-8-5')).toBe('2026-08-05');
  });

  it('parses dd-MM-yyyy and dd.MM.yyyy', () => {
    expect(parseDateOnly('05-08-2026')).toBe('2026-08-05');
    expect(parseDateOnly('05.08.2026')).toBe('2026-08-05');
  });

  it('parses Excel serial numbers', () => {
    // 45870 = 2025-08-01
    expect(parseDateOnly('45870')).toBe('2025-08-01');
  });

  it('rejects invalid dates', () => {
    expect(parseDateOnly('32/01/2026')).toBeNull();
    expect(parseDateOnly('29/02/2025')).toBeNull(); // not a leap year
    expect(parseDateOnly('abc')).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
  });

  it('accepts leap day on leap years', () => {
    expect(parseDateOnly('29/02/2024')).toBe('2024-02-29');
  });

  it('never shifts the day (no timezone involved)', () => {
    // the classic bug: new Date('2026-08-05') in UTC-7 displays 2026-08-04
    for (const input of ['01/01/2026', '31/12/2025', '2026-06-15']) {
      const iso = parseDateOnly(input)!;
      expect(formatDateOnly(iso)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      // round-trip must preserve the exact day
      expect(parseDateOnly(formatDateOnly(iso))).toBe(iso);
    }
  });
});

describe('formatDateOnly', () => {
  it('formats ISO to dd/MM/yyyy', () => {
    expect(formatDateOnly('2026-08-05')).toBe('05/08/2026');
  });
  it('handles empty', () => {
    expect(formatDateOnly('')).toBe('');
    expect(formatDateOnly(null)).toBe('');
  });
});

describe('isValidDateInput', () => {
  it('works', () => {
    expect(isValidDateInput('05/08/2026')).toBe(true);
    expect(isValidDateInput('nonsense')).toBe(false);
  });
});

describe('timezone helpers', () => {
  it('VN offset is +420 minutes (UTC+7, no DST)', () => {
    expect(tzOffsetMinutes(VN_TZ, new Date('2026-01-15T00:00:00Z'))).toBe(420);
    expect(tzOffsetMinutes(VN_TZ, new Date('2026-07-15T00:00:00Z'))).toBe(420);
  });

  it('wallTimeToUtc converts 08:30 VN to 01:30 UTC', () => {
    const utc = wallTimeToUtc(VN_TZ, 2026, 7, 15, 8, 30);
    expect(utc.toISOString()).toBe('2026-07-15T01:30:00.000Z');
  });
});
