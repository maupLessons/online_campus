import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { Course } from '../../schemas';
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

  @ApiProperty()
  @Expose()
  semester: number;

  @ApiProperty()
  @Expose()
  credits: number;
}
