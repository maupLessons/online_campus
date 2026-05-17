import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { CourseAssignment } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';

export class StudentCourseResponseDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => toId(obj._id))
  courseAssignmentId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.course?.name)
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.course?.code)
  courseCode: string;

  @ApiProperty()
  @Expose()
  academicYear: string;

  @ApiProperty()
  @Expose()
  semester: number;
}
