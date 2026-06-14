import {
  IsString,
  IsNotEmpty,
  IsMongoId,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { Faculty } from '../schemas';
import { User } from '../../users/schemas';

export class CreateDepartmentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsMongoId()
  @IsNotEmpty()
  @ExistsInDatabase(Faculty.name)
  faculty: string;

  @IsMongoId()
  @IsOptional()
  @ExistsInDatabase(User.name)
  head?: string | null;
}
