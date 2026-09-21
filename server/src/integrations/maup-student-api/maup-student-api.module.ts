import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAUP_API_FETCH,
  MaupStudentApiClient,
} from './maup-student-api.client';
import { MaupStudentApiController } from './maup-student-api.controller';
import { createMaupMockFetch } from './mock/maup-mock.fetch';
import { MaupReferenceCacheService } from './maup-reference-cache.service';

@Module({
  controllers: [MaupStudentApiController],
  providers: [
    {
      provide: MAUP_API_FETCH,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('MAUP_API_MOCK') === 'true'
          ? createMaupMockFetch()
          : globalThis.fetch.bind(globalThis),
    },
    MaupStudentApiClient,
    MaupReferenceCacheService,
  ],
  exports: [MaupStudentApiClient, MaupReferenceCacheService],
})
export class MaupStudentApiModule {}
