import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceLinkDto } from '../../dto/resource-link.dto';

export class CreateAssignmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  criteria?: string;

  @ApiProperty({ type: [ResourceLinkDto], required: false })
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ResourceLinkDto)
  resourceLinks?: ResourceLinkDto[];

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsString({ each: true })
  fileIds?: string[];

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiProperty()
  @IsNumber()
  maxScore: number;
}
