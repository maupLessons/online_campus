import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class AuditOutboxReadinessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuditOutboxReadinessService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    configService: ConfigService,
  ) {
    this.enabled = readBooleanFlag(
      configService.get<string>('AUDIT_TRANSACTIONAL_OUTBOX'),
      configService.get<string>('NODE_ENV') === 'production',
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB connection is unavailable for audit outbox');
    }

    const hello = (await database.admin().command({ hello: 1 })) as Record<
      string,
      unknown
    >;
    const replicaSetName = hello.setName;
    if (
      typeof replicaSetName !== 'string' ||
      replicaSetName.trim().length === 0
    ) {
      throw new Error(
        'AUDIT_TRANSACTIONAL_OUTBOX requires a MongoDB replica set',
      );
    }

    this.logger.log(
      `Transactional audit outbox ready on replica set ${replicaSetName}`,
    );
  }
}

function readBooleanFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}
