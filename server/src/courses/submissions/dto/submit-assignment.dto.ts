import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SubmitAssignmentDto {
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  @IsNotEmpty()
  fileIds: string[];
}
