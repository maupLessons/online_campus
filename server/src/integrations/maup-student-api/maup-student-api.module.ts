import { Module } from '@nestjs/common';
import {
  MAUP_API_FETCH,
  MaupStudentApiClient,
} from './maup-student-api.client';

@Module({
  providers: [
    {
      provide: MAUP_API_FETCH,
      useValue: globalThis.fetch.bind(globalThis),
    },
    MaupStudentApiClient,
  ],
  exports: [MaupStudentApiClient],
})
export class MaupStudentApiModule {}
