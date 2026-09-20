import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { SurveyDocument, SurveyTargetType } from './schemas';

const GLOBAL_SURVEY_REVIEWER_ROLES = new Set<Role>([
  Role.RECTOR,
  Role.PRESIDENT,
]);

const AUTHOR_ROLES = new Set<Role>([Role.ADMIN, Role.DEAN, Role.RECTOR]);
const BROAD_AUDIENCES = new Set<SurveyTargetType>([
  SurveyTargetType.ALL,
  SurveyTargetType.TEACHERS,
  SurveyTargetType.STUDENTS_TEACHERS,
]);

@Injectable()
export class SurveyAccessPolicy {
  canCreate(user: AuthenticatedUser): boolean {
    return AUTHOR_ROLES.has(user.role);
  }

  canTargetAudience(
    user: AuthenticatedUser,
    targetType: SurveyTargetType,
  ): boolean {
    if (user.role === Role.RECTOR) {
      return BROAD_AUDIENCES.has(targetType);
    }
    return true;
  }

  canListManagedSurveys(user: AuthenticatedUser): boolean {
    return this.canCreate(user) || user.role === Role.PRESIDENT;
  }

  hasGlobalManagementScope(user: AuthenticatedUser): boolean {
    return (
      user.role === Role.ADMIN || GLOBAL_SURVEY_REVIEWER_ROLES.has(user.role)
    );
  }

  canManage(survey: SurveyDocument, user: AuthenticatedUser): boolean {
    if (user.role === Role.ADMIN) {
      return true;
    }

    return (
      (user.role === Role.DEAN || user.role === Role.RECTOR) &&
      toId(survey.createdBy) === user.sub
    );
  }

  canViewResults(survey: SurveyDocument, user: AuthenticatedUser): boolean {
    return (
      this.canManage(survey, user) ||
      GLOBAL_SURVEY_REVIEWER_ROLES.has(user.role)
    );
  }

  canDelete(user: AuthenticatedUser): boolean {
    return user.role === Role.ADMIN;
  }
}
