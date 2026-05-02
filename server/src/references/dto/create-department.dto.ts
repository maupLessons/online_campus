import { IsString, IsNotEmpty, IsMongoId, IsOptional } from 'class-validator';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { Faculty, User } from '../../database/schemas';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsMongoId()
  @IsNotEmpty()
  @ExistsInDatabase(Faculty.name)
  faculty: string;

  @IsMongoId()
  @IsOptional()
  @ExistsInDatabase(User.name)
  head?: string;
}
