import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ScheduleModule } from './schedule/schedule.module';
import { CoursesModule } from './courses/courses.module';
import { ReferencesModule } from './references/references.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SeedModule } from './seed/seed.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditInterceptor } from './audit-log/audit.interceptor';
import { ExistsInDatabaseConstraint } from './common/validators/exists-in-database.validator';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 900000,
        limit: 10,
      },
    ]),
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: `mongodb://${config.get<string>(
          'MONGO_ROOT_USERNAME',
        )}:${config.get<string>('MONGO_ROOT_PASSWORD')}@${config.get<string>(
          'MONGO_HOST',
        )}:${config.get<string>('MONGO_PORT')}/${config.get<string>(
          'MONGO_DATABASE',
        )}?authSource=admin`,
      }),
    }),
    AuthModule,
    UsersModule,
    ScheduleModule,
    CoursesModule,
    ReferencesModule,
    NotificationsModule,
    SeedModule,
    AuditLogModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    ExistsInDatabaseConstraint,
  ],
})
export class AppModule {}
