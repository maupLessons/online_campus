import { PartialType } from '@nestjs/swagger';
import { CreateDepartmentDto } from './create-department.dto';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { IsMongoId, IsOptional } from 'class-validator';
import { Faculty } from '../schemas';
import { User } from '../../users/schemas';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @IsOptional()
  @IsMongoId()
  @ExistsInDatabase(Faculty.name)
  faculty?: string;

  @IsOptional()
  @IsMongoId()
  @ExistsInDatabase(User.name)
  head?: string;
}
