import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsSafeHttpsUrl } from '../../common/validators/https-url.validator';
import { CourseResourceType } from '../schemas';

export class ResourceLinkDto {
  @ApiProperty({ example: 'Google Classroom' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty({ enum: CourseResourceType, default: CourseResourceType.LINK })
  @IsEnum(CourseResourceType)
  type: CourseResourceType = CourseResourceType.LINK;

  @ApiProperty({ example: 'https://classroom.google.com/c/example' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @IsSafeHttpsUrl({ message: 'Посилання повинно бути безпечним HTTPS URL' })
  url: string;
}
