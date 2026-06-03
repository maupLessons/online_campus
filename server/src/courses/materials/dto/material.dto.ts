import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { FileDto } from '../../../files/dto/file.dto';
import { Material, MaterialCategory } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';
import { ResourceLinkDto } from '../../dto/resource-link.dto';

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

  @ApiProperty({ enum: MaterialCategory })
  @Expose()
  category: MaterialCategory;

  @ApiProperty({ type: [FileDto] })
  @Expose()
  @Type(() => FileDto)
  files: FileDto[];

  @ApiProperty({ type: [ResourceLinkDto], required: false })
  @Expose()
  resourceLinks?: ResourceLinkDto[];

  @ApiProperty()
  @Expose()
  publishDate: Date;
}
