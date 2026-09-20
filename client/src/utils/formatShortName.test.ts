import { describe, expect, it } from 'vitest';
import { formatShortName } from './formatShortName';

describe('formatShortName', () => {
  it('formats surname with initials', () => {
    expect(formatShortName('Іваненко', 'Іван', 'Петрович')).toBe('Іваненко І. П.');
  });
  it('omits missing middle name', () => {
    expect(formatShortName('Іваненко', 'Іван')).toBe('Іваненко І.');
  });
  it('returns surname only when no first name', () => {
    expect(formatShortName('Іваненко')).toBe('Іваненко');
  });
  it('parses a single full-name string', () => {
    expect(formatShortName('Іваненко Іван Петрович')).toBe('Іваненко І. П.');
  });
  it('returns empty string for empty input', () => {
    expect(formatShortName()).toBe('');
  });
});
