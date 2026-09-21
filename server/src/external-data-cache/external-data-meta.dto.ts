import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const EXTERNAL_DATA_REASONS = [
  'no_active_profile',
  'no_current_term',
] as const;
export type ExternalDataReason = (typeof EXTERNAL_DATA_REASONS)[number];

/** Спільний конверт відповідей `/gradebook/my` і `/finance/my` (спека §4.1). */
export class ExternalDataMetaDto {
  @ApiProperty({ type: String, nullable: true })
  profileId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-09-18T10:00:00.000Z',
  })
  fetchedAt: string | null;

  @ApiProperty() stale: boolean;

  @ApiPropertyOptional({ enum: EXTERNAL_DATA_REASONS })
  reason?: ExternalDataReason;
}

export function emptyExternalDataMeta(
  reason: ExternalDataReason,
): ExternalDataMetaDto {
  return { profileId: null, fetchedAt: null, stale: false, reason };
}
