import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoursesModule } from '../courses/courses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { SurveyAccessPolicy } from './survey-access.policy';
import { SurveyAudienceService } from './survey-audience.service';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import {
  Survey,
  SurveyCompletion,
  SurveyCompletionSchema,
  SurveyQuestion,
  SurveyQuestionSchema,
  SurveyResponse,
  SurveyResponseSchema,
  SurveySchema,
} from './schemas';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Survey.name, schema: SurveySchema },
      { name: SurveyQuestion.name, schema: SurveyQuestionSchema },
      { name: SurveyResponse.name, schema: SurveyResponseSchema },
      { name: SurveyCompletion.name, schema: SurveyCompletionSchema },
    ]),
    CoursesModule,
    UsersModule,
    NotificationsModule,
    AuditLogModule,
  ],
  controllers: [SurveysController],
  providers: [SurveysService, SurveyAccessPolicy, SurveyAudienceService],
  exports: [SurveysService],
})
export class SurveysModule {}
