import { BadRequestException } from '@nestjs/common';
import {
  assertMoodleUrl,
  assertResourceUrl,
  hostMatches,
  parseHttpsUrl,
  readHostList,
} from './url-policy';

describe('url-policy', () => {
  describe('parseHttpsUrl', () => {
    it('accepts a plain https url and returns URL', () => {
      expect(
        parseHttpsUrl('https://dist.maup.com.ua/course/view.php?id=1').hostname,
      ).toBe('dist.maup.com.ua');
    });

    it.each([
      ['http://dist.maup.com.ua/'],
      ['javascript:alert(1)'],
      ['data:text/html;base64,AAA'],
      ['https://user:pass@dist.maup.com.ua/'],
      ['not a url'],
      ['https://dist.maup.com.ua/' + 'a'.repeat(500)],
      ['https://192.168.0.10/x'],
      ['https://localhost/x'],
    ])('rejects %s', (value) => {
      expect(() => parseHttpsUrl(value)).toThrow(BadRequestException);
    });
  });

  describe('hostMatches', () => {
    it('matches exact host and subdomains, case-insensitive', () => {
      expect(hostMatches('dist.maup.com.ua', 'dist.maup.com.ua')).toBe(true);
      expect(hostMatches('DIST.MAUP.COM.UA', 'dist.maup.com.ua')).toBe(true);
      expect(hostMatches('a.dist.maup.com.ua', 'dist.maup.com.ua')).toBe(true);
      expect(hostMatches('evil-dist.maup.com.ua', 'dist.maup.com.ua')).toBe(
        false,
      );
    });
  });

  describe('assertMoodleUrl', () => {
    it('returns normalized url when host is allowed', () => {
      expect(
        assertMoodleUrl('https://dist.maup.com.ua/course/view.php?id=7', [
          'dist.maup.com.ua',
        ]),
      ).toBe('https://dist.maup.com.ua/course/view.php?id=7');
    });

    it('rejects host outside allowlist', () => {
      expect(() =>
        assertMoodleUrl('https://evil.example/course', ['dist.maup.com.ua']),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertResourceUrl', () => {
    it('accepts any https host not in blocklist', () => {
      expect(assertResourceUrl('https://youtube.com/watch?v=1', [])).toBe(
        'https://youtube.com/watch?v=1',
      );
    });

    it('rejects blocked host', () => {
      expect(() =>
        assertResourceUrl('https://bad.example/x', ['bad.example']),
      ).toThrow(BadRequestException);
    });

    it('rejects blocked host with a trailing root-label dot', () => {
      expect(() =>
        assertResourceUrl('https://bad.example./x', ['bad.example']),
      ).toThrow(BadRequestException);
    });
  });

  describe('trailing-dot hostname normalisation', () => {
    it('accepts an allowed Moodle host with a trailing dot', () => {
      expect(
        assertMoodleUrl('https://dist.maup.com.ua./course/view.php?id=7', [
          'dist.maup.com.ua',
        ]),
      ).toBe('https://dist.maup.com.ua./course/view.php?id=7');
    });

    it('matches uppercase host with a trailing dot against a plain pattern', () => {
      expect(hostMatches('DIST.MAUP.COM.UA.', 'dist.maup.com.ua')).toBe(true);
    });
  });

  describe('readHostList', () => {
    it('falls back when the raw value has only separators and no hosts', () => {
      expect(readHostList(',,,', ['dist.maup.com.ua'])).toEqual([
        'dist.maup.com.ua',
      ]);
    });
  });
});
