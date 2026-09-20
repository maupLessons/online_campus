import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { File, FileSchema } from './file.schema';
import { FILE_SCANNER } from './file-scanner.types';
import { LocalFileScannerService } from './local-file-scanner.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: File.name, schema: FileSchema }]),
    AuditLogModule,
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    LocalFileScannerService,
    {
      provide: FILE_SCANNER,
      useExisting: LocalFileScannerService,
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
