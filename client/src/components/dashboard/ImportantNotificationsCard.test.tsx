import { describe, expect, it } from 'vitest';
import type { Notification } from '../../types';
import { renderStatic } from '../../test/renderStatic';
import ImportantNotificationsCard from './ImportantNotificationsCard';

const n = (over: Partial<Notification>): Notification =>
  ({ id: 'n', type: 'announcement', title: 'Оплата', message: 'Сплатіть до 30.09', createdAt: '2026-09-18T00:00:00Z', readFlag: false, important: true, ...over }) as Notification;

describe('ImportantNotificationsCard', () => {
  it('renders up to three items and links only internal actionUrl', async () => {
    const html = await renderStatic(
      <ImportantNotificationsCard isLoading={false} items={[
        n({ id: '1', actionUrl: '/finance' }),
        n({ id: '2', title: 'Зовнішнє', actionUrl: '//evil.example' }),
        n({ id: '3', title: 'Третє' }),
        n({ id: '4', title: 'Четверте' }),
      ]} />,
    );
    expect(html).toContain('href="/finance"');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('Четверте');
    expect(html).toContain('href="/notifications"');
  });
  it('rejects a backslash-prefixed actionUrl', async () => {
    const html = await renderStatic(
      <ImportantNotificationsCard isLoading={false} items={[
        n({ id: '1', title: 'Бекслеш', actionUrl: '/\\evil.example' }),
      ]} />,
    );
    expect(html).not.toContain('evil.example');
  });
  it('renders empty state', async () => {
    const html = await renderStatic(<ImportantNotificationsCard isLoading={false} items={[]} />);
    expect(html).toContain('Важливих сповіщень немає');
  });
});
