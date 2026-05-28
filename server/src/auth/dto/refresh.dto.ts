import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Legacy refresh token fallback. Browser clients use the HttpOnly cookie.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
