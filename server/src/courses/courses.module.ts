import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoursesController } from './courses/courses.controller';
import { CoursesService } from './courses/courses.service';
import { MaterialsController } from './materials/materials.controller';
import { MaterialsService } from './materials/materials.service';
import { AssignmentsController } from './assignments/assignments.controller';
import { AssignmentsService } from './assignments/assignments.service';
import { SubmissionsController } from './submissions/submissions.controller';
import { SubmissionsService } from './submissions/submissions.service';
import { GradesController } from './grades/grades.controller';
import { GradesService } from './grades/grades.service';
import { LessonJournalController } from './journal/lesson-journal.controller';
import { LessonJournalService } from './journal/lesson-journal.service';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScheduleEntry, ScheduleEntrySchema } from '../schedule/schemas';
import { User, UserSchema } from '../users/schemas';
import {
  Course,
  CourseSchema,
  CourseAssignment,
  CourseAssignmentSchema,
  Material,
  MaterialSchema,
  Assignment,
  AssignmentSchema,
  Submission,
  SubmissionSchema,
  Grade,
  GradeSchema,
  LessonJournalEntry,
  LessonJournalEntrySchema,
} from './schemas';

@Module({
  imports: [
    FilesModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: LessonJournalEntry.name, schema: LessonJournalEntrySchema },
      { name: ScheduleEntry.name, schema: ScheduleEntrySchema },
    ]),
  ],
  controllers: [
    CoursesController,
    MaterialsController,
    AssignmentsController,
    SubmissionsController,
    GradesController,
    LessonJournalController,
  ],
  providers: [
    CoursesService,
    MaterialsService,
    AssignmentsService,
    SubmissionsService,
    GradesService,
    LessonJournalService,
  ],
  exports: [
    CoursesService,
    MaterialsService,
    AssignmentsService,
    SubmissionsService,
    GradesService,
    LessonJournalService,
  ],
})
export class CoursesModule {}
