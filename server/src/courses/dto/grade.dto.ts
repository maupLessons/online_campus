import { ApiProperty, PartialType, OmitType } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class GradeResponseDto {
  @ApiProperty()
  @Expose({ name: '_id' })
  @Transform(({ value }) => value?.toString())
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.student?._id?.toString() || obj.student?.toString())
  studentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.courseAssignment?._id?.toString() || obj.courseAssignment?.toString())
  courseAssignmentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }) =>
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
  @Transform(({ obj }) => obj.courseAssignment?.course?.name)
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.courseAssignment?.course?.code)
  courseCode: string;
}

export class CreateGradeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  courseAssignmentId: string;

  @ApiProperty({ enum: ['current', 'module', 'exam', 'final'] })
  @IsEnum(['current', 'module', 'exam', 'final'])
  type: string;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class UpdateGradeDto extends PartialType(
  OmitType(CreateGradeDto, ['studentId', 'courseAssignmentId'] as const),
) {}

export class GradeJournalResponseDto {
  @ApiProperty()
  @Expose()
  @Transform(({ value }) => value?.toString())
  studentId: string;

  @ApiProperty()
  @Expose()
  studentName: string;

  @ApiProperty({ type: [GradeResponseDto] })
  @Expose()
  @Type(() => GradeResponseDto)
  grades: GradeResponseDto[];
}

export class StudentCourseResponseDto {
  @ApiProperty()
  @Expose({ name: '_id' })
  @Transform(({ value }) => value?.toString())
  courseAssignmentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.course?.name)
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.course?.code)
  courseCode: string;

  @ApiProperty()
  @Expose()
  academicYear: string;

  @ApiProperty()
  @Expose()
  semester: number;
}
