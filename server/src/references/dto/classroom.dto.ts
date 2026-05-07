import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';
import { Classroom } from '../schemas';

@Exclude()
export class ClassroomDto {
  @Expose()
  @Transform(({ obj }: { obj: Classroom }) => obj._id.toString())
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  building: string;

  @Expose()
  @ApiProperty()
  roomNumber: string;

  @Expose()
  @ApiProperty()
  capacity: number;

  @Expose()
  @ApiProperty()
  type: string;
}
