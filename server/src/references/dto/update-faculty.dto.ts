import { PartialType } from '@nestjs/swagger';
import { CreateFacultyDto } from './create-faculty.dto';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { IsMongoId, IsOptional } from 'class-validator';
import { User } from '../../users/schemas';

export class UpdateFacultyDto extends PartialType(CreateFacultyDto) {
  @IsOptional()
  @IsMongoId()
  @ExistsInDatabase(User.name)
  dean?: string;
}
