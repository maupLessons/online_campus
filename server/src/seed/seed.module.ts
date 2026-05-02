import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import {
  User,
  UserSchema,
  Faculty,
  FacultySchema,
  Department,
  DepartmentSchema,
  Group,
  GroupSchema,
  Specialty,
  SpecialtySchema,
  Classroom,
  ClassroomSchema,
} from '../database/schemas';
import {
  UserSeeder,
  FacultySeeder,
  DepartmentSeeder,
  GroupSeeder,
  SpecialtySeeder,
  ClassroomSeeder,
} from './seeders';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Faculty.name, schema: FacultySchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Group.name, schema: GroupSchema },
      { name: Specialty.name, schema: SpecialtySchema },
      { name: Classroom.name, schema: ClassroomSchema },
    ]),
  ],
  providers: [
    SeedService,
    UserSeeder,
    FacultySeeder,
    DepartmentSeeder,
    GroupSeeder,
    SpecialtySeeder,
    ClassroomSeeder,
  ],
})
export class SeedModule {}
