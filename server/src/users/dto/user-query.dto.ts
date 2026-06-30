import { IsOptional, IsEnum, IsString, MaxLength, IsIn } from 'class-validator';
import { Role } from '../../common/types/roles.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const UserStatuses = ['active', 'blocked'] as const;
export type UserStatus = (typeof UserStatuses)[number];

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: UserStatuses })
  @IsOptional()
  @IsIn(UserStatuses)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Case-insensitive search by one or more name parts',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
