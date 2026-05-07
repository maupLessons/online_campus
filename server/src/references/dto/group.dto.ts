import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { SpecialtyDto } from './specialty.dto';
import { UserReferenceDto } from './user-reference.dto';
import { Group } from '../schemas';

@Exclude()
export class GroupDto {
  @Expose()
  @Transform(({ obj }: { obj: Group }) => obj._id.toString())
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  code: string;

  @Expose()
  @Type(() => SpecialtyDto)
  @ApiProperty({ type: () => SpecialtyDto })
  specialty: SpecialtyDto;

  @Expose()
  @ApiProperty()
  course: number;

  @Expose()
  @Type(() => UserReferenceDto)
  @ApiProperty({ type: () => UserReferenceDto, required: false })
  curator?: UserReferenceDto;
}
