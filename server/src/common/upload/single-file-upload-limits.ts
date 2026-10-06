import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export function singleFileUploadLimits(
  fileSize: number,
): NonNullable<MulterOptions['limits']> {
  return {
    fileSize,
    files: 1,
    fields: 0,
    fieldNameSize: 100,
    // Multer 2.4 adds one to Busboy's threshold so this is the maximum allowed.
    // Count ignored dispositions too: a second part must terminate the request.
    parts: 1,
  };
}
