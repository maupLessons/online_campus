import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { FileDto } from '../../files/dto/file.dto';

export class AssignmentIdDto {
  @ApiProperty()
  @Expose()
  id: string;
}

export class SubmissionDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj._id?.toString() || obj.id)
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.assignment?.toString() || obj.assignmentId)
  assignmentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.student?.toString() || obj.studentId)
  studentId: string;

  @ApiProperty({ type: [FileDto] })
  @Expose()
  @Type(() => FileDto)
  files: FileDto[];

  @ApiProperty()
  @Expose()
  submittedAt: Date;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty({ required: false })
  @Expose()
  score?: number;

  @ApiProperty({ required: false })
  @Expose()
  comment?: string;
}

export class AssignmentDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj._id?.toString() || obj.id)
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(
    ({ obj }) => obj.courseAssignment?.toString() || obj.courseAssignmentId,
  )
  courseAssignmentId: string;

  @ApiProperty()
  @Expose()
  title: string;

  @ApiProperty()
  @Expose()
  description: string;

  @ApiProperty({ type: [FileDto] })
  @Expose()
  @Type(() => FileDto)
  files: FileDto[];

  @ApiProperty()
  @Expose()
  dueDate: Date;

  @ApiProperty()
  @Expose()
  maxScore: number;

  @ApiProperty({ required: false })
  @Expose()
  courseName?: string;

  @ApiProperty({ type: SubmissionDto, required: false, nullable: true })
  @Expose()
  @Type(() => SubmissionDto)
  submission?: SubmissionDto | null;
}

export class CreateAssignmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsString({ each: true })
  fileIds?: string[];

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiProperty()
  @IsNumber()
  maxScore: number;
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class SubmitAssignmentDto {
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  @IsNotEmpty()
  fileIds: string[];
}

export class GradeSubmissionDto {
  @ApiProperty()
  @IsNumber()
  score: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  comment?: string;
}
