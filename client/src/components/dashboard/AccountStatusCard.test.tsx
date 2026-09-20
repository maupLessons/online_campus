import { describe, expect, it } from 'vitest';
import type { User } from '../../types';
import { renderStatic } from '../../test/renderStatic';
import AccountStatusCard from './AccountStatusCard';

describe('AccountStatusCard', () => {
  it('shows role and status only', async () => {
    const user = { id: 'u', login: 'l', role: 'student', email: 'e', firstName: 'A', lastName: 'B', status: 'blocked', studentProfiles: [] } as unknown as User;
    const html = await renderStatic(<AccountStatusCard user={user} />);
    expect(html).toContain('Студент');
    expect(html).toContain('Заблокований');
    expect(html).not.toContain('Рік навчання');
  });
});
