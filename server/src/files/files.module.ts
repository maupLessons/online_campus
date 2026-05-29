import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { File, FileSchema } from './file.schema';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { User, UserSchema } from '../users/schemas';
import {
  Assignment,
  AssignmentSchema,
  CourseAssignment,
  CourseAssignmentSchema,
  Material,
  MaterialSchema,
  Submission,
  SubmissionSchema,
} from '../courses/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: File.name, schema: FileSchema },
      { name: User.name, schema: UserSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
