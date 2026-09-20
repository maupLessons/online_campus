import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { Course, CourseStatus } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';

export class CourseDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Course }) => toId(obj._id))
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  code: string;

  @ApiProperty({ required: false })
  @Expose()
  description?: string;

  @ApiProperty()
  @Expose()
  credits: number;

  @ApiProperty({ required: false })
  @Expose()
  externalSubjectId?: string;

  @ApiProperty({ required: false })
  @Expose()
  moodleUrl?: string;

  @ApiProperty({ enum: CourseStatus })
  @Expose()
  status: CourseStatus;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Course }) => toId(obj.department))
  departmentId: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(
    ({ obj }: { obj: Course }) => (obj.department as { name?: string })?.name,
  )
  departmentName?: string;

  @ApiProperty({ required: false })
  @Expose()
  activeAssignmentsCount?: number;
}
