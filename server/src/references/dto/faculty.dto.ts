import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { UserReferenceDto } from './user-reference.dto';
import { Faculty } from '../../database/schemas'; // Import Faculty schema

@Exclude()
export class FacultyDto {
  @Expose()
  @Transform(({ obj }: { obj: Faculty }) => obj._id.toString())
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @Type(() => UserReferenceDto)
  @ApiProperty({ type: () => UserReferenceDto, required: false })
  dean?: UserReferenceDto;
}
