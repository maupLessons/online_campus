import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { FileDto } from '../../../files/dto/file.dto';
import { Material } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';

export class MaterialDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: Material }) => toId(obj))
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
