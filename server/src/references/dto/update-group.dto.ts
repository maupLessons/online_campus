import { PartialType } from '@nestjs/swagger';
import { CreateGroupDto } from './create-group.dto';
import { ExistsInDatabase } from '../../common/validators/exists-in-database.validator';
import { IsMongoId, IsOptional } from 'class-validator';
import { User, Specialty } from '../../database/schemas';

// Extending CreateGroupDto with PartialType makes all fields optional
export class UpdateGroupDto extends PartialType(CreateGroupDto) {
  // Manual re-application of validation decorators for optional fields that need custom validation
  // This is because PartialType makes them optional, but doesn't re-apply custom validators
  @IsOptional()
  @IsMongoId()
  @ExistsInDatabase(Specialty.name)
  specialty?: string;

  @IsOptional()
  @IsMongoId()
  @ExistsInDatabase(User.name)
  curator?: string;
}
