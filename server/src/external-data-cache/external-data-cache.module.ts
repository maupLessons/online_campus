import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { ExternalDataCacheService } from './external-data-cache.service';
import {
  ExternalDataCache,
  ExternalDataCacheSchema,
} from './schemas/external-data-cache.schema';
import { StudentContextService } from './student-context.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExternalDataCache.name, schema: ExternalDataCacheSchema },
    ]),
    UsersModule,
  ],
  providers: [ExternalDataCacheService, StudentContextService],
  exports: [ExternalDataCacheService, StudentContextService],
})
export class ExternalDataCacheModule {}
