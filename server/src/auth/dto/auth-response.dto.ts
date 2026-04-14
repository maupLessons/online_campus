import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'student1' })
  login: string;

  @ApiProperty({ example: 'STUDENT' })
  role: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ required: false })
  studentProfile?: any;

  @ApiProperty({ required: false })
  teacherProfile?: any;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken: string;

  @ApiProperty({ type: UserProfileDto })
  user?: UserProfileDto;
}
