import { describe, expect, it } from 'vitest';
import type { User } from '../../types';
import { renderStatic } from '../../test/renderStatic';
import ProfileSummaryCard from './ProfileSummaryCard';

const student = (over: Partial<User> = {}): User =>
  ({
    id: 'u1', login: 'st1', role: 'student', email: 'st1@maup.com.ua', phone: '+380501112233',
    firstName: 'Іван', lastName: 'Іваненко', middleName: 'Петрович', status: 'active',
    studentProfiles: [{
      id: 'p1', group: { id: 'g1', code: 'КН-21' }, recordBookNumber: 'RB1', year: 3,
      specialty: '122 Комп’ютерні науки', status: 'active',
    }],
    activeStudentProfileId: 'p1',
    ...over,
  }) as User;

describe('ProfileSummaryCard', () => {
  it('shows specialty, year and group code from the active profile', async () => {
    const html = await renderStatic(<ProfileSummaryCard user={student()} />);
    expect(html).toContain('122 Комп’ютерні науки');
    expect(html).toContain('КН-21');
    expect(html).toContain('3 курс');
    expect(html).toContain('st1@maup.com.ua');
    expect(html).not.toContain('g1');
  });
  it('renders a dash in the specialty tile when the profile has no specialty', async () => {
    const u = student({
      studentProfiles: [
        { id: 'p1', group: { id: 'g1', code: 'КН-21' }, recordBookNumber: 'RB1', year: 3, status: 'active' },
      ],
    } as Partial<User>);
    const html = await renderStatic(<ProfileSummaryCard user={u} />);
    const tile = html.slice(html.indexOf('Спеціальність'));
    expect(tile.slice(0, tile.indexOf('</div>'))).toContain('—');
    expect(html).not.toContain('122 Комп’ютерні науки');
  });
  it('shows a sync hint when a student has no active profile', async () => {
    const html = await renderStatic(<ProfileSummaryCard user={student({ studentProfiles: [], activeStudentProfileId: undefined })} />);
    expect(html).toContain('Академічні дані ще не синхронізовано');
  });
  it('shows position for a teacher and never the raw department id', async () => {
    const teacher = { ...student(), role: 'teacher', studentProfiles: [], teacherProfile: { department: 'd1', position: 'Доцент' } } as User;
    const html = await renderStatic(<ProfileSummaryCard user={teacher} />);
    expect(html).toContain('Доцент');
    expect(html).not.toContain('d1');
  });
});
