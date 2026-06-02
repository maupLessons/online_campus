import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class SelectElectiveDto {
  @ApiProperty()
  @IsMongoId()
  disciplineId: string;
}
