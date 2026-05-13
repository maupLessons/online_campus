import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
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
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Grade.name, schema: GradeSchema },
    ]),
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
