import { describe, expect, it } from 'vitest';
import type { User } from '../../types';
import { renderStatic } from '../../test/renderStatic';
import StudentProfileSections from './StudentProfileSections';

const user = (over: Partial<User> = {}): User =>
  ({
    id: 'u', login: 'st', role: 'student', email: 'e@x', firstName: 'І', lastName: 'П', status: 'active',
    studentProfiles: [
      { id: 'p1', externalStudentId: 'EXT-1', group: { id: 'g1', code: 'КН-21' }, recordBookNumber: 'RB-1', year: 3, institute: 'ННІ ІТ', specialty: '122 КН', studyForm: 'денна', status: 'active' },
      { id: 'p2', externalStudentId: 'EXT-2', group: { id: 'g2', code: 'МН-11' }, recordBookNumber: 'RB-2', year: 1, institute: 'ННІ Менеджменту', specialty: '073 Менеджмент', studyForm: 'заочна', status: 'inactive' },
      { id: 'p3', externalStudentId: 'EXT-3', group: { id: 'g3', code: 'ФІ-31' }, recordBookNumber: 'RB-3', year: 2, institute: 'ННІ Права', specialty: '081 Право', studyForm: 'денна', status: 'active' },
    ],
    activeStudentProfileId: 'p1',
    ...over,
  }) as User;

describe('StudentProfileSections', () => {
  it('renders student info from the active profile', async () => {
    const html = await renderStatic(<StudentProfileSections user={user()} />);
    expect(html).toContain('ННІ ІТ');
    expect(html).toContain('122 КН');
    expect(html).toContain('RB-1');
    expect(html).toContain('денна');
  });
  it('lists all profiles with current and inactive badges', async () => {
    const html = await renderStatic(<StudentProfileSections user={user()} />);
    expect(html).toContain('Мої навчальні профілі');
    expect(html).toContain('МН-11');
    expect(html).toContain('Поточний');
    expect(html).toContain('Неактивний');
  });
  it('shows a neutral active badge for an active, non-current profile', async () => {
    const html = await renderStatic(<StudentProfileSections user={user()} />);
    expect(html).toContain('ФІ-31');
    expect(html).toContain('Активний');
  });
  it('never renders externalStudentId', async () => {
    const html = await renderStatic(<StudentProfileSections user={user()} />);
    expect(html).not.toContain('EXT-1');
  });
  it('renders no inputs', async () => {
    const html = await renderStatic(<StudentProfileSections user={user()} />);
    expect(html).not.toContain('<input');
  });
  it('renders nothing for a teacher', async () => {
    const html = await renderStatic(<StudentProfileSections user={user({ role: 'teacher', studentProfiles: [] })} />);
    expect(html).toBe('');
  });
});
