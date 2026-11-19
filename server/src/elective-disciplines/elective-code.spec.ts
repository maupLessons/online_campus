import { ConflictException } from '@nestjs/common';
import {
  formatElectiveCode,
  insertWithGeneratedCode,
  nextElectiveCodeSequence,
} from './elective-code';

const duplicateKey = () => Object.assign(new Error('E11000'), { code: 11000 });

describe('elective-code', () => {
  it('formats the code from academic year, term and sequence', () => {
    expect(formatElectiveCode('2026/2027', 1, 7)).toBe('EL-2026-1-007');
    expect(formatElectiveCode('2026/2027', 2, 1000)).toBe('EL-2026-2-1000');
  });

  it('continues after the highest generated number and ignores manual codes', () => {
    expect(nextElectiveCodeSequence([])).toBe(1);
    expect(
      nextElectiveCodeSequence(['EL-2026-1-002', 'EL-AI-01', 'EL-2026-1-010']),
    ).toBe(11);
  });

  it('retries with the next number after a duplicate key', async () => {
    const insert = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(duplicateKey())
      .mockImplementation((code) => Promise.resolve(code));
    const code = await insertWithGeneratedCode({
      academicYear: '2026/2027',
      termNumber: 1,
      loadCodes: () => Promise.resolve(['EL-2026-1-003']),
      insert,
    });
    expect(insert.mock.calls.map(([c]) => c)).toEqual([
      'EL-2026-1-004',
      'EL-2026-1-005',
    ]);
    expect(code).toBe('EL-2026-1-005');
  });

  it('gives up after five duplicate keys with a 409', async () => {
    const insert = jest.fn().mockRejectedValue(duplicateKey());
    await expect(
      insertWithGeneratedCode({
        academicYear: '2026/2027',
        termNumber: 1,
        loadCodes: () => Promise.resolve([]),
        insert,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it('rethrows non-duplicate errors without retrying', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('validation'));
    await expect(
      insertWithGeneratedCode({
        academicYear: '2026/2027',
        termNumber: 1,
        loadCodes: () => Promise.resolve([]),
        insert,
      }),
    ).rejects.toThrow('validation');
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
