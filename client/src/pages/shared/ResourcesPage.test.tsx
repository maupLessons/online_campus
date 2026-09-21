import { describe, expect, it } from 'vitest';
import { renderStatic } from '../../test/renderStatic';
import ResourcesPage from './ResourcesPage';

describe('ResourcesPage', () => {
  it('renders six external links with safe attributes', async () => {
    const html = await renderStatic(<ResourcesPage />);
    const links = html.match(/<a [^>]*href="https:\/\/[^"]+"[^>]*>/g) ?? [];
    expect(links).toHaveLength(6);
    for (const a of links) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
    expect(html).toContain('https://maup.com.ua/');
    expect(html).toContain('https://dist.maup.com.ua/');
    expect(html).toContain('https://ir.maup.com.ua/home');
    expect(html).toContain('https://library.maup.com.ua/');
    expect(html).toContain(
      'https://play.google.com/store/apps/details?id=com.uosvita.app&amp;hl=uk',
    );
    expect(html).toContain(
      'https://apps.apple.com/ua/app/u-%D0%BE%D1%81%D0%B2%D1%96%D1%82%D0%B0/id6740523126',
    );
  });
  it('keeps the fixed order', async () => {
    const html = await renderStatic(<ResourcesPage />);
    const order = [
      'maup.com.ua/',
      'dist.maup.com.ua',
      'ir.maup.com.ua',
      'library.maup.com.ua',
      'play.google.com/store/apps/details?id=com.uosvita.app',
      'apps.apple.com/ua/app/u-%D0%BE%D1%81%D0%B2%D1%96%D1%82%D0%B0',
    ]
      .map((s) => html.indexOf(s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
