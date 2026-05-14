import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { MaterialsController } from './materials/materials.controller';
import { MaterialsService } from './materials/materials.service';
import { AssignmentsController } from './assignments/assignments.controller';
import { AssignmentsService } from './assignments/assignments.service';
import { SubmissionsController } from './submissions/submissions.controller';
import { SubmissionsService } from './submissions/submissions.service';
import { GradesController } from './grades/grades.controller';
import { GradesService } from './grades/grades.service';
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
} from './schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Grade.name, schema: GradeSchema },
    ]),
  ],
  controllers: [
    CoursesController,
    MaterialsController,
    AssignmentsController,
    SubmissionsController,
    GradesController,
  ],
  providers: [
    CoursesService,
    MaterialsService,
    AssignmentsService,
    SubmissionsService,
    GradesService,
  ],
  exports: [
    CoursesService,
    MaterialsService,
    AssignmentsService,
    SubmissionsService,
    GradesService,
  ],
})
export class CoursesModule {}
