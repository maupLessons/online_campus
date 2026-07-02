import { FileScanStatus } from './file.schema';

export const FILE_SCANNER = Symbol('FILE_SCANNER');

export type FileScanInput = {
  filePath: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export type FileScanResult = {
  status: FileScanStatus.CLEAN | FileScanStatus.REJECTED;
  provider: string;
  reason?: string;
};

export interface FileScanner {
  scan(input: FileScanInput): Promise<FileScanResult>;
}
