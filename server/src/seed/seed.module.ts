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
} from '../database/schemas';
import {
  UserSeeder,
  FacultySeeder,
  DepartmentSeeder,
  GroupSeeder,
} from './seeders';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Faculty.name, schema: FacultySchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Group.name, schema: GroupSchema },
    ]),
  ],
  providers: [
    SeedService,
    UserSeeder,
    FacultySeeder,
    DepartmentSeeder,
    GroupSeeder,
  ],
})
export class SeedModule {}
