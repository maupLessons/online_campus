import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Course,
  CourseAssignment,
  CourseAssignmentSchema,
  CourseSchema,
} from '../../courses/schemas';
import {
  Department,
  DepartmentSchema,
  Faculty,
  FacultySchema,
} from '../../references/schemas';
import { User, UserSchema } from '../../users/schemas';
import { AcademicAccessService } from './academic-access.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Faculty.name, schema: FacultySchema },
    ]),
  ],
  providers: [AcademicAccessService],
  exports: [AcademicAccessService],
})
export class AcademicAccessModule {}
