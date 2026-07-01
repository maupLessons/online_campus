import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../common/types/roles.enum';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { Department, Group } from '../../references/schemas';

export class ChangeUserRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({
    description: 'Required when changing the user role to student',
  })
  @ValidateIf((dto: ChangeUserRoleDto) => dto.role === Role.STUDENT)
  @IsMongoId()
  @ExistsInDatabase(Group.name)
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Required when changing the user role to student',
  })
  @ValidateIf((dto: ChangeUserRoleDto) => dto.role === Role.STUDENT)
  @IsString()
  @IsNotEmpty()
  recordBookNumber?: string;

  @ApiPropertyOptional({
    description:
      'Optional immutable MAUP student_id used for backend API integrations',
  })
  @ValidateIf(
    (dto: ChangeUserRoleDto) =>
      dto.role === Role.STUDENT && dto.externalStudentId !== undefined,
  )
  @IsString()
  @MaxLength(128)
  externalStudentId?: string;

  @ApiPropertyOptional({
    description: 'Required when changing the user role to student',
    minimum: 1,
  })
  @ValidateIf((dto: ChangeUserRoleDto) => dto.role === Role.STUDENT)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  year?: number;

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
