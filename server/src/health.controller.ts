import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { AcademicTermsService } from './academic-terms/academic-terms.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly academicTerms: AcademicTermsService,
  ) {}

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

      const current = await this.academicTerms.getCurrent();
      const academicTerm = current ? ('ok' as const) : ('missing' as const);
      return {
        status: current ? ('ready' as const) : ('degraded' as const),
        checks: { mongodb: 'ok' as const, academicTerm },
      };
    } catch {
      throw new ServiceUnavailableException({ status: 'not-ready' });
    }
  }
}
