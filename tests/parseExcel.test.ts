import { describe, expect, it } from 'vitest';
import { parseClipboard, detectHeaderMapping, pasteToRows } from '../src/lib/parseExcel';
import { getColumnsForType } from '../src/lib/columns';

const createCols = getColumnsForType('CREATE');

describe('parseClipboard', () => {
  it('splits tabs and newlines', () => {
    expect(parseClipboard('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles \\r\\n', () => {
    expect(parseClipboard('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles quoted cells containing newlines (Excel multi-line cell)', () => {
    expect(parseClipboard('"line1\nline2"\tb')).toEqual([['line1\nline2', 'b']]);
  });

  it('preserves Vietnamese characters', () => {
    const rows = parseClipboard('Nguyễn Văn Được\tPhòng Tuyển dụng');
    expect(rows[0][0]).toBe('Nguyễn Văn Được');
    expect(rows[0][1]).toBe('Phòng Tuyển dụng');
  });

  it('drops trailing empty rows', () => {
    expect(parseClipboard('a\tb\n\n')).toEqual([['a', 'b']]);
  });
});

describe('detectHeaderMapping', () => {
  it('detects standard headers (case/diacritic-insensitive)', () => {
    const mapping = detectHeaderMapping(
      ['Salutation', 'Full name', 'DOB', 'Position_ENG', 'Liên quân'],
      createCols,
    );
    expect(mapping).not.toBeNull();
    expect(mapping![0]).toBe('salutation');
    expect(mapping![1]).toBe('fullName');
    expect(mapping![2]).toBe('dob');
    expect(mapping![3]).toBe('positionEng');
    expect(mapping![4]).toBe('lienQuan');
  });

  it('returns null for data rows', () => {
    const mapping = detectHeaderMapping(['Ms.', 'Nguyễn Thị Anh', '12/08/1995'], createCols);
    expect(mapping).toBeNull();
  });
});

describe('pasteToRows', () => {
  it('maps by header when the first row is a header', () => {
    const text = 'Full name\tStarting Date\tPriority\nNguyễn Văn A\t05/08/2026\tUrgent';
    const result = pasteToRows(text, createCols);
    expect(result.headerDetected).toBe(true);
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].fullName).toBe('Nguyễn Văn A');
    expect(result.rows[0].startingDate).toBe('2026-08-05'); // normalized ISO, no shift
    expect(result.rows[0].priority).toBe('Urgent');
  });

  it('maps by column order without a header', () => {
    const cells = createCols.map(() => '');
    cells[createCols.findIndex((c) => c.key === 'fullName')] = 'Trần Thị B';
    cells[createCols.findIndex((c) => c.key === 'startingDate')] = '1/9/2026';
    const result = pasteToRows(cells.join('\t'), createCols);
    expect(result.headerDetected).toBe(false);
    expect(result.rows[0].fullName).toBe('Trần Thị B');
    expect(result.rows[0].startingDate).toBe('2026-09-01');
  });

  it('keeps phone numbers as text (leading zero preserved)', () => {
    const text = 'Full name\tPhone Number\nAnh C\t0903123456';
    const result = pasteToRows(text, createCols);
    expect(result.rows[0].phoneNumber).toBe('0903123456');
  });

  it('normalizes Work Email and keeps invalid dates as-is for validation', () => {
    const text = 'Full name\tWork Email\tDOB\nAnh D\tyes\t99/99/2026';
    const result = pasteToRows(text, createCols);
    expect(result.rows[0].workEmail).toBe('Yes');
    expect(result.rows[0].dob).toBe('99/99/2026'); // left intact -> validation flags it
  });

  it('parses multiple rows at once', () => {
    const text = 'Full name\tStarting Date\nA\t01/08/2026\nB\t02/08/2026\nC\t03/08/2026';
    const result = pasteToRows(text, createCols);
    expect(result.rowCount).toBe(3);
  });
});
