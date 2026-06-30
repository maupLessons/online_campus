import { BadRequestException } from '@nestjs/common';
import {
  normalizeOriginalFileName,
  validateUploadFile,
} from './file-upload-validation.util';

function uploadFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  const buffer = Buffer.concat([
    Buffer.from('%PDF-', 'ascii'),
    Buffer.from(' test document'),
  ]);

  return {
    fieldname: 'file',
    originalname: 'document.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  } as Express.Multer.File;
}

describe('file upload validation', () => {
  it('accepts a file only when extension, MIME and signature match', () => {
    const file = uploadFile();

    expect(validateUploadFile(file)).toMatchObject({
      originalName: 'document.pdf',
      extension: '.pdf',
      mimeType: 'application/pdf',
      size: file.buffer.length,
    });
  });

  it('rejects a spoofed file with a trusted extension and MIME type', () => {
    const file = uploadFile({
      buffer: Buffer.from('<script>alert("xss")</script>', 'utf8'),
      size: Buffer.byteLength('<script>alert("xss")</script>'),
    });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it('rejects a mismatched reported file size', () => {
    const file = uploadFile({ size: 999 });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it('normalizes path fragments and unsafe filename characters', () => {
    expect(normalizeOriginalFileName('..\\\\draft<2026>.pdf')).toBe(
      'draft 2026 .pdf',
    );
  });
});
