import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class PaginatedDto<T> {
  @ApiProperty({ isArray: true })
  @Expose()
  @Type(() => Object)
  docs: T[];

  @ApiProperty()
  @Expose()
  totalDocs: number;

  @ApiProperty()
  @Expose()
  limit: number;

  @ApiProperty()
  @Expose()
  page: number;

  @ApiProperty()
  @Expose()
  totalPages: number;

  @ApiProperty()
  @Expose()
  hasNextPage: boolean;

  @ApiProperty()
  @Expose()
  hasPrevPage: boolean;

  @ApiProperty({ required: false })
  @Expose()
  nextPage?: number;

  @ApiProperty({ required: false })
  @Expose()
  prevPage?: number;
}
