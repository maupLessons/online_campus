import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsInt,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClassroomDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  building: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  roomNumber: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  capacity: number;

  @IsEnum(['lecture', 'lab', 'seminar', 'online'])
  type: string;
}
