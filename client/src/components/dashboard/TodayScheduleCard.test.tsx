import { describe, expect, it } from 'vitest';
import type { ScheduleEntry, ScheduleMeta } from '../../types';
import { renderStatic } from '../../test/renderStatic';
import TodayScheduleCard from './TodayScheduleCard';

const entry = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id: 'e1', date: '2026-09-18', startTime: '09:00', endTime: '10:20',
  courseTitle: 'Бази даних', subjectKey: 'db-1', type: 'lecture' as ScheduleEntry['type'],
  teacherName: 'Петренко Петро Петрович', classroom: '305',
  onlineFormat: false, groupCode: 'КН-21', ...over,
});

const meta = (over: Partial<ScheduleMeta> = {}): ScheduleMeta => ({ stale: false, ...over });

describe('TodayScheduleCard', () => {
  it('renders time, title, short teacher name, classroom and lesson type', async () => {
    const html = await renderStatic(
      <TodayScheduleCard lessons={[entry()]} session={[]} meta={meta()} isLoading={false} />,
    );
    expect(html).toContain('09:00');
    expect(html).toContain('Бази даних');
    expect(html).toContain('Петренко П. П.');
    expect(html).toContain('305');
    expect(html).toContain('Лекція');
  });
  it('renders session entries before lessons', async () => {
    const html = await renderStatic(
      <TodayScheduleCard
        lessons={[entry({ id: 'l1', courseTitle: 'Заняття', startTime: '08:30' })]}
        session={[entry({ id: 's1', courseTitle: 'Сесійна пара', type: 'exam' as ScheduleEntry['type'], controlType: 'exam', startTime: '14:00' })]}
        meta={meta()}
        isLoading={false}
      />,
    );
    expect(html.indexOf('Сесійна пара')).toBeLessThan(html.indexOf('Заняття'));
    expect(html).toContain('Екзамен');
  });
  it('renders an online link instead of classroom when onlineUrl is set', async () => {
    const html = await renderStatic(
      <TodayScheduleCard
        lessons={[entry({ classroom: undefined, onlineFormat: true, onlineUrl: 'https://meet.example/abc' })]}
        session={[]} meta={meta()} isLoading={false}
      />,
    );
    expect(html).toMatch(/<a [^>]*href="https:\/\/meet\.example\/abc"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  });
  it('shows the online badge without a link when there is no url', async () => {
    const html = await renderStatic(
      <TodayScheduleCard lessons={[entry({ classroom: undefined, onlineFormat: true })]} session={[]} meta={meta()} isLoading={false} />,
    );
    expect(html).toContain('Онлайн');
    expect(html).not.toContain('<a ');
  });
  it('ignores non-https urls', async () => {
    const html = await renderStatic(
      <TodayScheduleCard
        lessons={[entry({ classroom: undefined, onlineFormat: true, onlineUrl: 'javascript:alert(1)' })]}
        session={[]} meta={meta()} isLoading={false}
      />,
    );
    expect(html).not.toContain('javascript:');
  });
  it('renders the empty state when both arrays are empty and there is no reason', async () => {
    const html = await renderStatic(<TodayScheduleCard lessons={[]} session={[]} meta={meta()} isLoading={false} />);
    expect(html).toContain('На сьогодні занять немає');
  });
  it('renders the reason text instead of the empty state', async () => {
    const html = await renderStatic(
      <TodayScheduleCard lessons={[]} session={[]} meta={meta({ reason: 'no_current_term' })} isLoading={false} />,
    );
    expect(html).toContain('Навчальний період не налаштовано');
    expect(html).not.toContain('На сьогодні занять немає');
  });
  it('renders the stale caption with fetchedAt', async () => {
    const html = await renderStatic(
      <TodayScheduleCard
        lessons={[entry()]} session={[]}
        meta={meta({ stale: true, fetchedAt: '2026-09-18T06:00:00.000Z' })}
        isLoading={false}
      />,
    );
    expect(html).toContain('Показано розклад станом на');
  });
});
