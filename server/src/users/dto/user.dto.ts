import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/types/roles.enum';

class StudentProfileDto {
  @ApiProperty()
  recordBookNumber: string;

  @ApiProperty()
  year: number;
}

class TeacherProfileDto {
  @ApiProperty()
  position: string;
}

export class UserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  login: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ required: false })
  middleName?: string;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ required: false })
  avatarUrl?: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ type: () => StudentProfileDto, required: false })
  studentProfile?: StudentProfileDto;

  @ApiProperty({ type: () => TeacherProfileDto, required: false })
  teacherProfile?: TeacherProfileDto;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
