import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { Grade } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';

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
  @Transform(({ obj }: { obj: Grade }) => obj.courseAssignment?.course?.name)
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Grade }) => obj.courseAssignment?.course?.code)
  courseCode: string;
}
