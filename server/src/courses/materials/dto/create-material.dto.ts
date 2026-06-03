import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceLinkDto } from '../../dto/resource-link.dto';
import { MaterialCategory } from '../../schemas';

export class CreateMaterialDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: MaterialCategory, required: false })
  @IsOptional()
  @IsEnum(MaterialCategory)
  category?: MaterialCategory;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  fileIds?: string[];

  @ApiProperty({ type: [ResourceLinkDto], required: false })
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ResourceLinkDto)
  resourceLinks?: ResourceLinkDto[];
}
