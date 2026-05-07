import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { FacultyDto } from './faculty.dto';
import { UserReferenceDto } from './user-reference.dto';
import { Department } from '../schemas';

@Exclude()
export class DepartmentDto {
  @Expose()
  @Transform(({ obj }: { obj: Department }) => obj._id.toString())
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @Type(() => FacultyDto)
  @ApiProperty({ type: () => FacultyDto })
  faculty: FacultyDto;

  @Expose()
  @Type(() => UserReferenceDto)
  @ApiProperty({ type: () => UserReferenceDto, required: false })
  head?: UserReferenceDto;
}
