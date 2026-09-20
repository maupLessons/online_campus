import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { CourseAssignment } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';
import { AcademicTermRefDto, termRef } from './academic-term-ref.dto';

export class StudentCourseResponseDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => toId(obj._id))
  courseAssignmentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.course?.name)
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.course?.code)
  courseCode: string;

  @ApiProperty({ type: () => AcademicTermRefDto })
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => termRef(obj.term))
  term: AcademicTermRefDto | null;
}
