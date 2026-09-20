import { describe, expect, it } from 'vitest';
import { deriveInitialScope } from './onlineLinkScope';

// Final wave M2: the modal's initial scope must match the picked-up link
// (§4.2 priority is lesson > date > discipline), otherwise "Save" edits the wrong record.
describe('deriveInitialScope', () => {
  it('defaults to pair when there is no matched link', () => {
    expect(deriveInitialScope(undefined)).toBe('pair');
  });

  it('returns pair when the link has both date and startTime', () => {
    expect(deriveInitialScope({ date: '2026-09-07', startTime: '08:30' })).toBe('pair');
  });

  it('returns date when the link has a date but no startTime', () => {
    expect(deriveInitialScope({ date: '2026-09-07', startTime: null })).toBe('date');
  });

  it('returns subject when the link has neither date nor startTime', () => {
    expect(deriveInitialScope({ date: null, startTime: null })).toBe('subject');
  });
});
