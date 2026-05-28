import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditInterceptor } from './audit-log/audit.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { UserAwareThrottlerGuard } from './common/guards/user-aware-throttler.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { ExistsInDatabaseConstraint } from './common/validators/exists-in-database.validator';
import { SeedModule } from './seed/seed.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ScheduleModule } from './schedule/schedule.module';
import { CoursesModule } from './courses/courses.module';
import { ReferencesModule } from './references/references.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { SurveysModule } from './surveys/surveys.module';

function readPositiveNumber(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const value = Number(config.get<string>(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isTest = config.get<string>('NODE_ENV') === 'test';
        const uri = config.get<string>('MONGODB_URI');
        const connectionOptions = {
          retryAttempts: isTest
            ? 0
            : readPositiveNumber(config, 'MONGO_RETRY_ATTEMPTS', 20),
          retryDelay: readPositiveNumber(config, 'MONGO_RETRY_DELAY_MS', 3000),
          serverSelectionTimeoutMS: readPositiveNumber(
            config,
            'MONGO_SERVER_SELECTION_TIMEOUT_MS',
            isTest ? 1000 : 5000,
          ),
        };

        if (uri) {
          return { uri, ...connectionOptions };
        }

        return {
          uri: `mongodb://${config.get<string>(
            'MONGO_ROOT_USERNAME',
          )}:${config.get<string>('MONGO_ROOT_PASSWORD')}@${config.get<string>(
            'MONGO_HOST',
          )}:${config.get<string>('MONGO_PORT')}/${config.get<string>(
            'MONGO_DATABASE',
          )}?authSource=admin`,
          ...connectionOptions,
        };
      },
    }),
    AuthModule,
    UsersModule,
    ScheduleModule,
    CoursesModule,
    ReferencesModule,
    NotificationsModule,
    SeedModule,
    AuditLogModule,
    FilesModule,
    SurveysModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ExistsInDatabaseConstraint,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
