import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExternalDataMetaDto } from '../external-data-cache/external-data-meta.dto';

export const GRADEBOOK_ENTRY_STATUSES = [
  'graded',
  'not_passed',
  'absent',
  'not_admitted',
  'pending',
] as const;
export type GradebookEntryStatus = (typeof GRADEBOOK_ENTRY_STATUSES)[number];

export class GradebookEntryDto {
  @ApiProperty() subject: string;
  @ApiPropertyOptional() teacher?: string;
  @ApiProperty() controlType: string;
  @ApiPropertyOptional() score?: number;
  @ApiPropertyOptional() ects?: string;
  @ApiPropertyOptional() date?: string;
  @ApiProperty({ enum: GRADEBOOK_ENTRY_STATUSES }) status: GradebookEntryStatus;
}

export class GradebookSemesterDto {
  @ApiProperty({ example: '2026/2027' }) academicYear: string;
  /**
   * Семестр освітньої програми (спека 04 §4.1), наскрізна нумерація 1..12
   * — підтверджено документацією MAUP (§11.1a), а не в межах року.
   */
  @ApiProperty() semester: number;
  @ApiProperty() isCurrent: boolean;
  @ApiProperty({ type: [GradebookEntryDto] }) entries: GradebookEntryDto[];
}

export class GradebookDto {
  @ApiProperty({ type: [GradebookSemesterDto] })
  semesters: GradebookSemesterDto[];
  @ApiProperty({ type: ExternalDataMetaDto }) meta: ExternalDataMetaDto;
}
