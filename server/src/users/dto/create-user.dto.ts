import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  IsIn,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '../../common/types/roles.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StudentProfileInputDto } from './student-profile-input.dto';

export class CreateUserDto {
  @ApiProperty({ example: 'student1' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Логін має містити мінімум 2 символи' })
  login: string;

  @ApiProperty({ example: 'Password1' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Пароль має містити мінімум 8 символів' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]+$/, {
    message:
      'Пароль має містити лише англійські літери та цифри (мінімум одна літера і одна цифра)',
  })
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;

  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Іван' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Іванов' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: 'Іванович' })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional({ example: '+380501234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'blocked'] })
  @IsOptional()
  @IsIn(['active', 'blocked'])
  status?: 'active' | 'blocked';

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    type: [StudentProfileInputDto],
    description: 'Обовʼязково для role=student (мінімум 1)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => StudentProfileInputDto)
  studentProfiles?: StudentProfileInputDto[];

  @ApiPropertyOptional({ description: 'MAUP prepod_id' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalTeacherId?: string;
}
