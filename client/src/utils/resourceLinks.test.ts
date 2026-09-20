import { describe, expect, it } from 'vitest';
import { validateResourceUrl, MAX_RESOURCES } from './resourceLinks';

describe('validateResourceUrl', () => {
  it('accepts https', () => {
    expect(validateResourceUrl('https://youtube.com/watch?v=1')).toBeNull();
  });
  it.each(['http://x.example', 'javascript:alert(1)', 'not a url', 'https://u:p@x.example/'])(
    'rejects %s',
    (v) => expect(validateResourceUrl(v)).toBe('courses.resources.errors.url'),
  );
  it('rejects too long', () => {
    expect(validateResourceUrl('https://x.example/' + 'a'.repeat(500))).toBe('courses.resources.errors.url');
  });
  it('exports limit 20', () => expect(MAX_RESOURCES).toBe(20));
});
