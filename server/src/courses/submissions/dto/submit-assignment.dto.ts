import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsMongoId,
} from 'class-validator';

export class SubmitAssignmentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsMongoId({ each: true })
  fileIds: string[];
}
