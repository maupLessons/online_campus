import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { CoursesService } from '../courses/courses/courses.service';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UserDto } from '../users/dto/user.dto';
import { UsersService } from '../users/users.service';
import { SurveyDocument, SurveyTargetType } from './schemas';

@Injectable()
export class SurveyAudienceService {
  private readonly logger = new Logger(SurveyAudienceService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly coursesService: CoursesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async isTargetedToUser(
    survey: SurveyDocument,
    user: AuthenticatedUser,
    profile: UserDto,
  ): Promise<boolean> {
    if (survey.targetType === SurveyTargetType.ALL) {
      return user.role === Role.STUDENT;
    }

    if (survey.targetType === SurveyTargetType.TEACHERS) {
      return user.role === Role.TEACHER;
    }

    if (survey.targetType === SurveyTargetType.STUDENTS_TEACHERS) {
      return user.role === Role.STUDENT || user.role === Role.TEACHER;
    }

    if (survey.targetType === SurveyTargetType.GROUPS) {
      return (
        user.role === Role.STUDENT &&
        profile.studentProfile?.group !== undefined &&
        profile.studentProfile.group !== null &&
        survey.targetIds.includes(profile.studentProfile.group)
      );
    }

    if (user.role !== Role.STUDENT) {
      return false;
    }

    return this.coursesService.isUserAssignedToCourseTargets({
      userId: user.sub,
      role: user.role,
      targetIds: survey.targetIds,
      groupId: profile.studentProfile?.group,
    });
  }

  async countExpectedRecipients(survey: SurveyDocument): Promise<number> {
    const recipients = await this.resolveRecipients(survey);
    return new Set(recipients).size;
  }

  async notifyPublished(survey: SurveyDocument): Promise<void> {
    try {
      const surveyId = toId(survey._id);
      const payload = {
        title: 'Нове опитування',
        message: survey.title,
        type: NotificationType.NEW_SURVEY,
        actionUrl: `/surveys/${surveyId}`,
        entityType: 'survey',
        entityId: surveyId,
        important: true,
      };

      if (survey.targetType === SurveyTargetType.ALL) {
        await this.notificationsService.create({
          ...payload,
          targetType: 'students',
        });
        return;
      }

      if (survey.targetType === SurveyTargetType.TEACHERS) {
        await this.notificationsService.create({
          ...payload,
          targetType: 'teachers',
        });
        return;
      }

      if (survey.targetType === SurveyTargetType.STUDENTS_TEACHERS) {
        await this.notificationsService.create({
          ...payload,
          targetType: 'students_teachers',
        });
        return;
      }

      if (survey.targetType === SurveyTargetType.GROUPS) {
        await this.notificationsService.createMany(
          survey.targetIds.map((groupId) => ({
            ...payload,
            targetType: 'group',
            groupId,
          })),
        );
        return;
      }

      const recipients = await this.resolveRecipients(survey);
      if (recipients.length === 0) {
        this.logger.warn(
          `Survey notification skipped: no recipients for survey ${surveyId}`,
        );
        return;
      }

      await this.notificationsService.createMany(
        recipients.map((userId) => ({
          ...payload,
          userId,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Survey notification was not created: ${message}`);
    }
  }

  private async resolveRecipients(survey: SurveyDocument): Promise<string[]> {
    if (survey.targetType === SurveyTargetType.ALL) {
      return this.usersService.findActiveUserIdsByRoles([Role.STUDENT]);
    }

    if (survey.targetType === SurveyTargetType.TEACHERS) {
      return this.usersService.findActiveUserIdsByRoles([Role.TEACHER]);
    }

    if (survey.targetType === SurveyTargetType.STUDENTS_TEACHERS) {
      return this.usersService.findActiveUserIdsByRoles([
        Role.STUDENT,
        Role.TEACHER,
      ]);
    }

    if (survey.targetType === SurveyTargetType.GROUPS) {
      const studentsByGroup = await Promise.all(
        survey.targetIds.map((groupId) =>
          this.usersService.getStudentsByGroup(groupId),
        ),
      );
      return [
        ...new Set(
          studentsByGroup
            .flat()
            .filter(
              (student) =>
                student.role === Role.STUDENT && student.status === 'active',
            )
            .map((student) => student.id)
            .filter(Boolean),
        ),
      ];
    }

    return this.coursesService.findStudentIdsByCourseTargets(survey.targetIds);
  }
}
