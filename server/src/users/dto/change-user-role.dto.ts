import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../common/types/roles.enum';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { Department } from '../../references/schemas';
import { StudentProfileInputDto } from './student-profile-input.dto';

export class ChangeUserRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({
    type: [StudentProfileInputDto],
    description: 'Required when changing the user role to student',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => StudentProfileInputDto)
  studentProfiles?: StudentProfileInputDto[];

  @ApiPropertyOptional({
    description:
      'Optional immutable MAUP prepod_id used for backend API integrations',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalTeacherId?: string;

  @ApiPropertyOptional({
    description: 'Required when changing the user role to teacher',
  })
  @ValidateIf((dto: ChangeUserRoleDto) => dto.role === Role.TEACHER)
  @IsMongoId()
  @ExistsInDatabase(Department.name)
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Required when changing the user role to teacher',
  })
  @ValidateIf((dto: ChangeUserRoleDto) => dto.role === Role.TEACHER)
  @IsString()
  @IsNotEmpty()
  position?: string;
}
