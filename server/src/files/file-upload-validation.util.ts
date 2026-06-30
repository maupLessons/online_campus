import 'multer';
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

export type ValidatedUploadFile = {
  originalName: string;
  extension: string;
  mimeType: string;
  size: number;
};

const ALLOWED_FILE_TYPES = new Map<string, Set<string>>([
  ['.png', new Set(['image/png'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.doc', new Set(['application/msword'])],
  [
    '.docx',
    new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
  ],
  ['.zip', new Set(['application/zip', 'application/x-zip-compressed'])],
]);

const MAX_ORIGINAL_NAME_LENGTH = 180;
const OLE_COMPOUND_FILE_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PDF_HEADER = Buffer.from('%PDF-', 'ascii');

export function validateUploadFile(
  file: Express.Multer.File,
): ValidatedUploadFile {
  if (!file?.buffer || file.buffer.length === 0) {
    throw new BadRequestException('Файл порожній або пошкоджений');
  }

  if (file.size !== undefined && file.size !== file.buffer.length) {
    throw new BadRequestException('Некоректний розмір файлу');
  }

  const originalName = normalizeOriginalFileName(file.originalname);
  const extension = path.extname(originalName).toLowerCase();
  const allowedMimeTypes = ALLOWED_FILE_TYPES.get(extension);

  if (!allowedMimeTypes || !allowedMimeTypes.has(file.mimetype)) {
    throw new BadRequestException('Недопустимий тип файлу');
  }

  if (!hasExpectedFileSignature(extension, file.buffer)) {
    throw new BadRequestException('Вміст файлу не відповідає його типу');
  }

  return {
    originalName,
    extension,
    mimeType: file.mimetype,
    size: file.buffer.length,
  };
}

export function normalizeOriginalFileName(originalName: string): string {
  const decodedName = Buffer.from(originalName ?? '', 'latin1').toString(
    'utf8',
  );
  const basename = path.posix.basename(decodedName.replace(/\\/g, '/'));
  const normalized = basename
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .split('')
    .map((character) => (isControlCharacter(character) ? ' ' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ORIGINAL_NAME_LENGTH);

  if (!normalized || normalized === '.' || normalized === '..') {
    throw new BadRequestException('Некоректна назва файлу');
  }

  return normalized;
}

function hasExpectedFileSignature(extension: string, buffer: Buffer): boolean {
  if (extension === '.png') {
    return startsWith(buffer, PNG_HEADER);
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
  }

  if (extension === '.pdf') {
    return startsWith(buffer, PDF_HEADER);
  }

  if (extension === '.doc') {
    return startsWith(buffer, OLE_COMPOUND_FILE_HEADER);
  }

  if (extension === '.docx' || extension === '.zip') {
    return isZipContainer(buffer);
  }

  return false;
}

function isZipContainer(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }

  return (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  );
}

function startsWith(buffer: Buffer, expectedHeader: Buffer): boolean {
  return (
    buffer.length >= expectedHeader.length &&
    buffer.subarray(0, expectedHeader.length).equals(expectedHeader)
  );
}

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 31 || code === 127;
}
