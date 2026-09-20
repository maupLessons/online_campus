import { describe, expect, it } from 'vitest';
import { renderStatic } from '../../test/renderStatic';
import ResourcesPage from './ResourcesPage';

describe('ResourcesPage', () => {
  it('renders four external links with safe attributes', async () => {
    const html = await renderStatic(<ResourcesPage />);
    const links = html.match(/<a [^>]*href="https:\/\/[^"]+"[^>]*>/g) ?? [];
    expect(links).toHaveLength(4);
    for (const a of links) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
    expect(html).toContain('https://maup.com.ua/');
    expect(html).toContain('https://dist.maup.com.ua/');
    expect(html).toContain('https://ir.maup.com.ua/home');
    expect(html).toContain('https://library.maup.com.ua/');
  });
  it('keeps the fixed order', async () => {
    const html = await renderStatic(<ResourcesPage />);
    const order = ['maup.com.ua/', 'dist.maup.com.ua', 'ir.maup.com.ua', 'library.maup.com.ua']
      .map((s) => html.indexOf(s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
