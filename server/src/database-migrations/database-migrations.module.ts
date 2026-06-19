import { Module } from '@nestjs/common';
import { DatabaseMigrationsService } from './database-migrations.service';
import {
  DATABASE_MIGRATIONS,
  DATABASE_MIGRATIONS_TOKEN,
} from './database-migrations.registry';

@Module({
  providers: [
    {
      provide: DATABASE_MIGRATIONS_TOKEN,
      useValue: DATABASE_MIGRATIONS,
    },
    DatabaseMigrationsService,
  ],
})
export class DatabaseMigrationsModule {}
