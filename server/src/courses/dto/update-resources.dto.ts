import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { ResourceLinkDto } from './resource-link.dto';
import { MAX_COURSE_RESOURCES } from '../schemas';

export class UpdateResourcesDto {
  @ApiProperty({ type: () => [ResourceLinkDto] })
  @IsArray()
  @ArrayMaxSize(MAX_COURSE_RESOURCES)
  @ValidateNested({ each: true })
  @Type(() => ResourceLinkDto)
  resources: ResourceLinkDto[];
}
