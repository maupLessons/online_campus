import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  readCookie,
} from './auth-cookie.util';

interface JwtPayload {
  sub: string;
  login: string;
  role: string;
}

function isJwtPayload(payload: unknown): payload is JwtPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sub' in payload &&
    'login' in payload &&
    'role' in payload &&
    typeof (payload as Record<string, unknown>).sub === 'string' &&
    typeof (payload as Record<string, unknown>).login === 'string' &&
    typeof (payload as Record<string, unknown>).role === 'string'
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = config.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }

    const accessCookieName =
      config.get<string>('AUTH_ACCESS_COOKIE_NAME') ??
      DEFAULT_ACCESS_TOKEN_COOKIE_NAME;

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => readCookie(req, accessCookieName),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: unknown) {
    if (!isJwtPayload(payload)) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.usersService.findAuthIdentityById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Користувача не знайдено');
    }

    if (user.status === 'blocked') {
      throw new ForbiddenException('Обліковий запис заблоковано');
    }

    return { sub: user.id, login: user.login, role: user.role };
  }
}
