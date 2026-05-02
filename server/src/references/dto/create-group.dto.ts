import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsMongoId,
  IsOptional,
} from 'class-validator';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { Specialty, User } from '../../database/schemas';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsMongoId()
  @IsNotEmpty()
  @ExistsInDatabase(Specialty.name)
  specialty: string;

  @IsNumber()
  @IsNotEmpty()
  course: number;

  @IsMongoId()
  @IsOptional()
  @ExistsInDatabase(User.name)
  curator?: string;
}
