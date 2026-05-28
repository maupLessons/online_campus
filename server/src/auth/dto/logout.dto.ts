import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description:
      'Legacy refresh token fallback. Browser clients use the HttpOnly cookie.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
