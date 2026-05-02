import { IsString, IsNotEmpty, IsMongoId, IsOptional } from 'class-validator';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { User } from '../../database/schemas';

export class CreateFacultyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsMongoId()
  @IsOptional()
  @ExistsInDatabase(User.name)
  dean?: string;
}
