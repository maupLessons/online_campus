import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
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
import { FilesModule } from './files/files.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 100 },
      { name: 'auth', ttl: 900000, limit: 10 },
    ]),
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isTest = config.get<string>('NODE_ENV') === 'test';
        const uri = config.get<string>('MONGODB_URI');

        if (uri) {
          return { uri };
        }

        return {
          uri: `mongodb://${config.get<string>(
            'MONGO_ROOT_USERNAME',
          )}:${config.get<string>('MONGO_ROOT_PASSWORD')}@${config.get<string>(
            'MONGO_HOST',
          )}:${config.get<string>('MONGO_PORT')}/${config.get<string>(
            'MONGO_DATABASE',
          )}?authSource=admin`,
          retryAttempts: isTest
            ? 0
            : Number(config.get<string>('MONGO_RETRY_ATTEMPTS') ?? 3),
          retryDelay: Number(
            config.get<string>('MONGO_RETRY_DELAY_MS') ?? 1000,
          ),
          serverSelectionTimeoutMS: Number(
            config.get<string>('MONGO_SERVER_SELECTION_TIMEOUT_MS') ??
              (isTest ? 1000 : 5000),
          ),
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ExistsInDatabaseConstraint,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
