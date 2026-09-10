import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export function singleFileUploadLimits(
  fileSize: number,
): NonNullable<MulterOptions['limits']> {
  return {
    fileSize,
    files: 1,
    fields: 0,
    fieldNameSize: 100,
    // Busboy emits partsLimit when it reaches the threshold, not after it.
    // Allow one valid part; the second part must terminate the request.
    parts: 2,
  };
}
