import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Request } from 'express';

type RequestUser = {
  sub?: unknown;
};

type RequestWithOptionalUser = Request & {
  user?: RequestUser;
};

type JwtPayload = {
  sub?: unknown;
};

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected override getTracker(req: RequestWithOptionalUser): Promise<string> {
    const userId = this.getAuthenticatedUserId(req);
    if (userId) {
      return Promise.resolve(`user:${userId}`);
    }

    return Promise.resolve(`ip:${this.getClientIp(req)}`);
  }

  private getAuthenticatedUserId(req: RequestWithOptionalUser): string | null {
    if (typeof req.user?.sub === 'string' && req.user.sub) {
      return req.user.sub;
    }

    const token = this.extractBearerToken(req);
    if (!token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return typeof payload.sub === 'string' && payload.sub
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }

  private extractBearerToken(req: Request): string | null {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return null;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }

  private getClientIp(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
