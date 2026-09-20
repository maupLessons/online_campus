import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { StudentProfileSyncService } from './student-profile-sync.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas';
import { Group, GroupSchema } from '../references/schemas';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AcademicAccessModule } from '../common/access/academic-access.module';
import { MaupStudentApiModule } from '../integrations/maup-student-api/maup-student-api.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Group.name, schema: GroupSchema },
    ]),
    AuditLogModule,
    AcademicAccessModule,
    MaupStudentApiModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, StudentProfileSyncService],
  exports: [UsersService, StudentProfileSyncService],
})
export class UsersModule {}
