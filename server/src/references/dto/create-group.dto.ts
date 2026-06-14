import {
  IsString,
  IsNotEmpty,
  IsMongoId,
  IsOptional,
  IsInt,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { Specialty } from '../schemas';
import { User } from '../../users/schemas';

export class CreateGroupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-ZА-ЯІЇЄ0-9][A-ZА-ЯІЇЄ0-9._-]*$/u)
  code: string;

  @IsMongoId()
  @IsNotEmpty()
  @ExistsInDatabase(Specialty.name)
  specialty: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  course: number;

  @IsMongoId()
  @IsOptional()
  @ExistsInDatabase(User.name)
  curator?: string | null;
}
