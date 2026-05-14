import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class FileDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj._id?.toString() || obj.id)
  id: string;

  @ApiProperty()
  @Expose()
  originalName: string;

  @ApiProperty()
  @Expose()
  mimetype: string;

  @ApiProperty()
  @Expose()
  size: number;
}
