import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsMongoId,
  IsOptional,
} from 'class-validator';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { Specialty } from '../schemas';
import { User } from '../../users/schemas';

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
