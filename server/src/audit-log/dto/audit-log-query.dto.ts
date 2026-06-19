import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../common/types/roles.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';

export enum AuditLogResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export enum AuditLogDomain {
  IDENTITY = 'identity',
  SCHEDULE = 'schedule',
  LEARNING = 'learning',
  SURVEYS = 'surveys',
  ELECTIVES = 'electives',
  REFERENCES = 'references',
  NOTIFICATIONS = 'notifications',
  REPORTS = 'reports',
  FILES = 'files',
  AUDIT = 'audit',
}

function trimQueryValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class AuditLogQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AuditLogDomain })
  @IsOptional()
  @IsEnum(AuditLogDomain)
  domain?: AuditLogDomain;

  @ApiPropertyOptional({ description: 'Filter by actor id' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  userId?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive actor login search' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  userLogin?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  userRole?: Role;

  @ApiPropertyOptional({ description: 'Case-insensitive action search' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  targetEntity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  targetId?: string;

  @ApiPropertyOptional({ enum: AuditLogResult })
  @IsOptional()
  @IsEnum(AuditLogResult)
  result?: AuditLogResult;

  @ApiPropertyOptional({ description: 'ISO date-time lower bound' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date-time upper bound' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimQueryValue(value))
  requestId?: string;
}
