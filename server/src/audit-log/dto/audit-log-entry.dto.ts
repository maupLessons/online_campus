import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { toId } from '../../common/utils/to-id.util';
import { Role } from '../../common/types/roles.enum';

type AuditLogLike = {
  _id?: unknown;
  id?: unknown;
};

function dateToIso(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'string' ? value : undefined;
}

export class AuditLogEntryDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: AuditLogLike }) => toId(obj._id ?? obj.id))
  id: string;

  @ApiPropertyOptional({
    description: 'Stable idempotency identifier for outbox-delivered events',
  })
  @Expose()
  eventId?: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }: { value?: Date | string }) => dateToIso(value))
  timestamp: string;

  @ApiProperty({ nullable: true })
  @Expose()
  userId: string | null;

  @ApiProperty()
  @Expose()
  userLogin: string;

  @ApiPropertyOptional({ enum: Role })
  @Expose()
  userRole?: Role;

  @ApiProperty()
  @Expose()
  action: string;

  @ApiPropertyOptional()
  @Expose()
  targetEntity?: string;

  @ApiPropertyOptional()
  @Expose()
  targetId?: string;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  details?: Record<string, unknown>;

  @ApiProperty()
  @Expose()
  ipAddress: string;

  @ApiProperty()
  @Expose()
  userAgent: string;

  @ApiProperty({ enum: ['success', 'failure'] })
  @Expose()
  result: 'success' | 'failure';

  @ApiPropertyOptional()
  @Expose()
  requestId?: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }: { value?: Date | string }) => dateToIso(value))
  createdAt: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }: { value?: Date | string }) => dateToIso(value))
  updatedAt: string;
}
