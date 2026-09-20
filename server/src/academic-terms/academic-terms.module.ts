import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AcademicTerm,
  AcademicTermSchema,
} from './schemas/academic-term.schema';
import { AcademicTermsService } from './academic-terms.service';
import { AcademicTermsController } from './academic-terms.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';
// Import from the files themselves, NOT from the `../courses/schemas` / `../elective-disciplines/schemas`
// barrels: after Tasks 6–7 those schemas reference `academic-term.schema` themselves, and going through index.ts
// would form an ESM cycle in which `SchemaFactory` can receive undefined.
import {
  CourseAssignment,
  CourseAssignmentSchema,
} from '../courses/schemas/course-assignment.schema';
import {
  ElectiveDiscipline,
  ElectiveDisciplineSchema,
} from '../elective-disciplines/schemas/elective-discipline.schema';
import {
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodSchema,
} from '../elective-disciplines/schemas/elective-selection-period.schema';

@Module({
  imports: [
    AuditLogModule,
    MongooseModule.forFeature([
      { name: AcademicTerm.name, schema: AcademicTermSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      {
        name: ElectiveSelectionPeriod.name,
        schema: ElectiveSelectionPeriodSchema,
      },
      { name: ElectiveDiscipline.name, schema: ElectiveDisciplineSchema },
    ]),
  ],
  controllers: [AcademicTermsController],
  providers: [AcademicTermsService],
  exports: [AcademicTermsService],
})
export class AcademicTermsModule {}
