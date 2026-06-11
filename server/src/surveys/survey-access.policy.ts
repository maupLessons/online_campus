import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { SurveyDocument } from './schemas';

const GLOBAL_SURVEY_MANAGER_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.RECTOR,
  Role.PRESIDENT,
]);

@Injectable()
export class SurveyAccessPolicy {
  canCreate(user: AuthenticatedUser): boolean {
    return (
      GLOBAL_SURVEY_MANAGER_ROLES.has(user.role) || user.role === Role.DEAN
    );
  }

  canListManagedSurveys(user: AuthenticatedUser): boolean {
    return this.canCreate(user);
  }

  hasGlobalManagementScope(user: AuthenticatedUser): boolean {
    return GLOBAL_SURVEY_MANAGER_ROLES.has(user.role);
  }

  canManage(survey: SurveyDocument, user: AuthenticatedUser): boolean {
    if (this.hasGlobalManagementScope(user)) {
      return true;
    }

    return user.role === Role.DEAN && toId(survey.createdBy) === user.sub;
  }

  canViewResults(survey: SurveyDocument, user: AuthenticatedUser): boolean {
    return this.canManage(survey, user);
  }

  canDelete(user: AuthenticatedUser): boolean {
    return user.role === Role.ADMIN;
  }
}
