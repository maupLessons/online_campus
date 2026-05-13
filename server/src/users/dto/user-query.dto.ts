import { IsOptional, IsEnum } from 'class-validator';
import { Role } from '../../common/types/roles.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
