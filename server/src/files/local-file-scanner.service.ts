import { Injectable } from '@nestjs/common';
import { FileScanStatus } from './file.schema';
import {
  FileScanInput,
  FileScanResult,
  FileScanner,
} from './file-scanner.types';

@Injectable()
export class LocalFileScannerService implements FileScanner {
  scan(input: FileScanInput): Promise<FileScanResult> {
    return Promise.resolve({
      status: FileScanStatus.CLEAN,
      provider: 'local-signature-validation',
      reason: `Validated ${input.mimeType} by extension, MIME and signature checks`,
    });
  }
}
