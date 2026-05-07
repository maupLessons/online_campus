import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/types/roles.enum';
import { Expose, Transform, Type } from 'class-transformer';
import { User } from '../schemas';

class StudentProfileDto {
  @ApiProperty()
  @Expose()
  recordBookNumber: string;

  @ApiProperty()
  @Expose()
  year: number;
}

class TeacherProfileDto {
  @ApiProperty()
  @Expose()
  position: string;
}

export class UserDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: User }) => obj._id.toString())
  id: string;

  @ApiProperty()
  @Expose()
  login: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty({ enum: Role })
  @Expose()
  role: Role;

  @ApiProperty()
  @Expose()
  firstName: string;

  @ApiProperty()
  @Expose()
  lastName: string;

  @ApiProperty({ required: false })
  @Expose()
  middleName?: string;

  @ApiProperty({ required: false })
  @Expose()
  phone?: string;

  @ApiProperty({ required: false })
  @Expose()
  avatarUrl?: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty({ type: () => StudentProfileDto, required: false })
  @Expose()
  @Type(() => StudentProfileDto)
  studentProfile?: StudentProfileDto;

  @ApiProperty({ type: () => TeacherProfileDto, required: false })
  @Expose()
  @Type(() => TeacherProfileDto)
  teacherProfile?: TeacherProfileDto;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: User }) => obj.createdAt.toISOString())
  createdAt: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: User }) => obj.updatedAt.toISOString())
  updatedAt: string;
}
