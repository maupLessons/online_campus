import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { FileDto } from '../../../files/dto/file.dto';
import { Assignment } from '../../schemas';
import { SubmissionDto } from '../../submissions/dto';
import { toId } from '../../../common/utils/to-id.util';

export class AssignmentDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Assignment }) => toId(obj))
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Assignment }) => toId(obj.courseAssignment))
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
