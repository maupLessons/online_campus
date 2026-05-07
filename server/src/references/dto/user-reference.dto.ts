import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';
import { User } from '../../users/schemas'; // Import User schema

@Exclude()
export class UserReferenceDto {
  @Expose()
  @Transform(({ obj }: { obj: User }) => obj._id.toString())
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  firstName: string;

  @Expose()
  @ApiProperty()
  lastName: string;

  @Expose()
  @ApiProperty({ required: false })
  middleName?: string;
}
