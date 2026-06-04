import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { Grade } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';

const getNestedString = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object' || !(key in value)) {
    return undefined;
  }

  const nestedValue = (value as Record<string, unknown>)[key];
  return typeof nestedValue === 'string' ? nestedValue : undefined;
};

export class GradeResponseDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Grade }) => toId(obj._id))
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Grade }) => toId(obj.student))
  studentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Grade }) => toId(obj.courseAssignment))
  courseAssignmentId: string;

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  @Transform(({ obj }: { obj: Grade }) =>
    obj.lessonJournalEntry ? toId(obj.lessonJournalEntry) : null,
  )
  lessonJournalEntryId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  @Transform(({ obj }: { obj: Grade }) =>
    obj.assignment ? toId(obj.assignment) : null,
  )
  assignmentId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  @Transform(({ obj }: { obj: Grade }) =>
    obj.submission ? toId(obj.submission) : null,
  )
  submissionId?: string | null;

  @ApiProperty()
  @Expose()
  @Transform(({ value }: { value: Date | string }) =>
    value instanceof Date ? value.toISOString().split('T')[0] : value,
  )
  date: string;

  @ApiProperty()
  @Expose()
  type: string;

  @ApiProperty()
  @Expose()
  value: number;

  @ApiProperty({ required: false })
  @Expose()
  comment?: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Grade }) =>
    getNestedString(
      obj.courseAssignment &&
        typeof obj.courseAssignment === 'object' &&
        'course' in obj.courseAssignment
        ? (obj.courseAssignment as { course?: unknown }).course
        : undefined,
      'name',
    ),
  )
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Grade }) =>
    getNestedString(
      obj.courseAssignment &&
        typeof obj.courseAssignment === 'object' &&
        'course' in obj.courseAssignment
        ? (obj.courseAssignment as { course?: unknown }).course
        : undefined,
      'code',
    ),
  )
  courseCode: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ obj }: { obj: Grade }) =>
    getNestedString(obj.assignment, 'title'),
  )
  assignmentTitle?: string;
}
