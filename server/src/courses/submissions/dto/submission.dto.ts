import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { FileDto } from '../../../files/dto/file.dto';
import { Submission } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';

type PopulatedStudent = {
  login?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
};

const getStudent = (value: unknown): PopulatedStudent | null =>
  value && typeof value === 'object' ? value : null;

const formatStudentName = (value: unknown): string | undefined => {
  const student = getStudent(value);
  if (!student) return undefined;

  return [student.lastName, student.firstName, student.middleName]
    .filter(Boolean)
    .join(' ');
};

export class SubmissionDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Submission }) => toId(obj))
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Submission }) => toId(obj.assignment))
  assignmentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Submission }) => toId(obj.student))
  studentId: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ obj }: { obj: Submission }) => formatStudentName(obj.student))
  studentName?: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ obj }: { obj: Submission }) => getStudent(obj.student)?.login)
  studentLogin?: string;

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

  @ApiProperty()
  @Expose()
  attemptNumber: number;

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  returnComment?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  returnedAt?: Date | null;
}
