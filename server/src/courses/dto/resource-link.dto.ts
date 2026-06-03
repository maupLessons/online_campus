import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class ResourceLinkDto {
  @ApiProperty({ example: 'Google Classroom' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'https://classroom.google.com/c/example' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^https:\/\/[^\s<>"']+$/, {
    message: 'Посилання повинно бути безпечним HTTPS URL',
  })
  url: string;
}
