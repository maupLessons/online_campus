import { Types } from 'mongoose';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { SurveyAccessPolicy } from './survey-access.policy';
import { SurveyDocument } from './schemas';

describe('SurveyAccessPolicy', () => {
  const policy = new SurveyAccessPolicy();
  const ownerId = new Types.ObjectId();
  const survey = {
    createdBy: ownerId,
  } as SurveyDocument;

  const user = (role: Role, sub = new Types.ObjectId().toHexString()) =>
    ({
      sub,
      login: `${role}-user`,
      role,
    }) satisfies AuthenticatedUser;

  it('grants global management scope only to administrators', () => {
    const actor = user(Role.ADMIN);

    expect(policy.canCreate(actor)).toBe(true);
    expect(policy.canManage(survey, actor)).toBe(true);
    expect(policy.canViewResults(survey, actor)).toBe(true);
  });

  it.each([Role.RECTOR, Role.PRESIDENT])(
    'keeps %s read-only while allowing global result review',
    (role) => {
      const actor = user(role);

      expect(policy.canCreate(actor)).toBe(false);
      expect(policy.canListManagedSurveys(actor)).toBe(true);
      expect(policy.canManage(survey, actor)).toBe(false);
      expect(policy.canViewResults(survey, actor)).toBe(true);
    },
  );

  it('limits deans to surveys they created', () => {
    const owner = user(Role.DEAN, ownerId.toHexString());
    const otherDean = user(Role.DEAN);

    expect(policy.canCreate(owner)).toBe(true);
    expect(policy.canManage(survey, owner)).toBe(true);
    expect(policy.canViewResults(survey, owner)).toBe(true);
    expect(policy.canManage(survey, otherDean)).toBe(false);
    expect(policy.canViewResults(survey, otherDean)).toBe(false);
  });

  it('keeps deletion restricted to administrators', () => {
    expect(policy.canDelete(user(Role.ADMIN))).toBe(true);
    expect(policy.canDelete(user(Role.RECTOR))).toBe(false);
    expect(policy.canDelete(user(Role.PRESIDENT))).toBe(false);
    expect(policy.canDelete(user(Role.DEAN))).toBe(false);
  });

  it.each([Role.STUDENT, Role.TEACHER, Role.DEPARTMENT_HEAD])(
    'denies management operations to %s',
    (role) => {
      const actor = user(role);

      expect(policy.canCreate(actor)).toBe(false);
      expect(policy.canListManagedSurveys(actor)).toBe(false);
      expect(policy.canManage(survey, actor)).toBe(false);
      expect(policy.canViewResults(survey, actor)).toBe(false);
    },
  );
});
