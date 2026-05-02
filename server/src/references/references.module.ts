import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferencesController } from './references.controller';
import {
  Classroom,
  ClassroomSchema,
  Department,
  DepartmentSchema,
  Faculty,
  FacultySchema,
  Group,
  GroupSchema,
  Specialty,
  SpecialtySchema,
  User,
  UserSchema,
} from '../database/schemas';
import { GroupsService } from './groups.service';
import { ClassroomsService } from './classrooms.service';
import { DepartmentsService } from './departments.service';
import { FacultiesService } from './faculties.service';
import { SpecialtiesService } from './specialties.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Faculty.name, schema: FacultySchema },
      { name: Specialty.name, schema: SpecialtySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReferencesController],
  providers: [
    GroupsService,
    ClassroomsService,
    DepartmentsService,
    FacultiesService,
    SpecialtiesService,
  ],
})
export class ReferencesModule {}
