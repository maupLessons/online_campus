import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { SurveyDocument } from './schemas';

const GLOBAL_SURVEY_REVIEWER_ROLES = new Set<Role>([
  Role.RECTOR,
  Role.PRESIDENT,
]);

@Injectable()
export class SurveyAccessPolicy {
  canCreate(user: AuthenticatedUser): boolean {
    return user.role === Role.ADMIN || user.role === Role.DEAN;
  }

  canListManagedSurveys(user: AuthenticatedUser): boolean {
    return this.canCreate(user) || GLOBAL_SURVEY_REVIEWER_ROLES.has(user.role);
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

    return user.role === Role.DEAN && toId(survey.createdBy) === user.sub;
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
