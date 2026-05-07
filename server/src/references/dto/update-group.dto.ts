import { PartialType } from '@nestjs/swagger';
import { CreateGroupDto } from './create-group.dto';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { IsMongoId, IsOptional } from 'class-validator';
import { User } from '../../users/schemas';
import { Specialty } from '../schemas';

export class UpdateGroupDto extends PartialType(CreateGroupDto) {
  @IsOptional()
  @IsMongoId()
  @ExistsInDatabase(Specialty.name)
  specialty?: string;

  @IsOptional()
  @IsMongoId()
  @ExistsInDatabase(User.name)
  curator?: string;
}
