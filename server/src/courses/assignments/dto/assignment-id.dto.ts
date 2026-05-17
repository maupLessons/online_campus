import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class AssignmentIdDto {
  @ApiProperty()
  @Expose()
  id: string;
}
