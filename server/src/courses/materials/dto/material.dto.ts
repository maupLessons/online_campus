import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { FileDto } from '../../../files/dto/file.dto';

export class MaterialDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj._id?.toString() || obj.id)
  id: string;

  @ApiProperty()
  @Expose()
  title: string;

  @ApiProperty({ required: false })
  @Expose()
  description?: string;

  @ApiProperty({ type: [FileDto] })
  @Expose()
  @Type(() => FileDto)
  files: FileDto[];

  @ApiProperty()
  @Expose()
  publishDate: Date;
}
