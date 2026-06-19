import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    const database = this.connection.db;
    if (
      this.connection.readyState !== ConnectionStates.connected ||
      !database
    ) {
      throw new ServiceUnavailableException({ status: 'not-ready' });
    }

    try {
      await database.command({ ping: 1 }, { timeoutMS: 2_000 });
      return {
        status: 'ready' as const,
        checks: { mongodb: 'ok' as const },
      };
    } catch {
      throw new ServiceUnavailableException({ status: 'not-ready' });
    }
  }
}
