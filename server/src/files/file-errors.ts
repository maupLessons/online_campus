import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

type LocalizedFileMessages = {
  uk: string;
  en: string;
};

export enum FileErrorCode {
  EMPTY_OR_CORRUPTED = 'FILE_EMPTY_OR_CORRUPTED',
  INVALID_SIZE = 'FILE_INVALID_SIZE',
  TYPE_NOT_ALLOWED = 'FILE_TYPE_NOT_ALLOWED',
  SIGNATURE_MISMATCH = 'FILE_SIGNATURE_MISMATCH',
  INVALID_ORIGINAL_NAME = 'FILE_INVALID_ORIGINAL_NAME',
  SCAN_REJECTED = 'FILE_SCAN_REJECTED',
  SAVE_FAILED = 'FILE_SAVE_FAILED',
  INVALID_ID = 'FILE_INVALID_ID',
  NOT_FOUND = 'FILE_NOT_FOUND',
  DOWNLOAD_FORBIDDEN = 'FILE_DOWNLOAD_FORBIDDEN',
  ATTACH_FORBIDDEN = 'FILE_ATTACH_FORBIDDEN',
  DELETE_FORBIDDEN = 'FILE_DELETE_FORBIDDEN',
  DELETE_FAILED = 'FILE_DELETE_FAILED',
  PENDING_SCAN = 'FILE_PENDING_SCAN',
  REJECTED_BY_SCAN = 'FILE_REJECTED_BY_SCAN',
  INVALID_STORAGE_PATH = 'FILE_INVALID_STORAGE_PATH',
}

export enum FileSuccessCode {
  UPLOAD_SUCCESS = 'FILE_UPLOAD_SUCCESS',
  DELETE_SUCCESS = 'FILE_DELETE_SUCCESS',
}

const FILE_ERROR_MESSAGES: Record<FileErrorCode, LocalizedFileMessages> = {
  [FileErrorCode.EMPTY_OR_CORRUPTED]: {
    uk: 'Файл порожній або пошкоджений',
    en: 'The file is empty or corrupted',
  },
  [FileErrorCode.INVALID_SIZE]: {
    uk: 'Некоректний розмір файлу',
    en: 'Invalid file size',
  },
  [FileErrorCode.TYPE_NOT_ALLOWED]: {
    uk: 'Недопустимий тип файлу',
    en: 'This file type is not allowed',
  },
  [FileErrorCode.SIGNATURE_MISMATCH]: {
    uk: 'Вміст файлу не відповідає його типу',
    en: 'The file content does not match its declared type',
  },
  [FileErrorCode.INVALID_ORIGINAL_NAME]: {
    uk: 'Некоректна назва файлу',
    en: 'Invalid file name',
  },
  [FileErrorCode.SCAN_REJECTED]: {
    uk: 'Файл не пройшов перевірку безпеки',
    en: 'The file did not pass the security scan',
  },
  [FileErrorCode.SAVE_FAILED]: {
    uk: 'Помилка при збереженні файлу',
    en: 'Could not save the file',
  },
  [FileErrorCode.INVALID_ID]: {
    uk: 'Некоректний ID файлу',
    en: 'Invalid file ID',
  },
  [FileErrorCode.NOT_FOUND]: {
    uk: 'Файл не знайдено',
    en: 'File not found',
  },
  [FileErrorCode.DOWNLOAD_FORBIDDEN]: {
    uk: 'Немає прав для завантаження цього файлу',
    en: 'You do not have permission to download this file',
  },
  [FileErrorCode.ATTACH_FORBIDDEN]: {
    uk: 'Немає прав для використання файлу',
    en: 'You do not have permission to use this file',
  },
  [FileErrorCode.DELETE_FORBIDDEN]: {
    uk: 'Немає прав для видалення цього файлу',
    en: 'You do not have permission to delete this file',
  },
  [FileErrorCode.DELETE_FAILED]: {
    uk: 'Помилка при видаленні файлу',
    en: 'Could not delete the file',
  },
  [FileErrorCode.PENDING_SCAN]: {
    uk: 'Файл ще проходить перевірку безпеки',
    en: 'The file is still being security scanned',
  },
  [FileErrorCode.REJECTED_BY_SCAN]: {
    uk: 'Файл недоступний після перевірки безпеки',
    en: 'The file is unavailable after the security scan',
  },
  [FileErrorCode.INVALID_STORAGE_PATH]: {
    uk: 'Некоректний шлях файлу',
    en: 'Invalid file storage path',
  },
};

const FILE_SUCCESS_MESSAGES: Record<FileSuccessCode, LocalizedFileMessages> = {
  [FileSuccessCode.UPLOAD_SUCCESS]: {
    uk: 'Файл успішно завантажено',
    en: 'File uploaded successfully',
  },
  [FileSuccessCode.DELETE_SUCCESS]: {
    uk: 'Файл видалено',
    en: 'File deleted',
  },
};

export type LocalizedFileErrorResponse = {
  code: FileErrorCode;
  message: string;
  messages: LocalizedFileMessages;
};

export function fileErrorResponse(
  code: FileErrorCode,
): LocalizedFileErrorResponse {
  const messages = FILE_ERROR_MESSAGES[code];
  return {
    code,
    message: messages.uk,
    messages,
  };
}

export function fileSuccessResponse(code: FileSuccessCode): {
  code: FileSuccessCode;
  message: string;
  messages: LocalizedFileMessages;
} {
  const messages = FILE_SUCCESS_MESSAGES[code];
  return {
    code,
    message: messages.uk,
    messages,
  };
}

export function fileBadRequest(code: FileErrorCode): BadRequestException {
  return new BadRequestException(fileErrorResponse(code));
}

export function fileForbidden(code: FileErrorCode): ForbiddenException {
  return new ForbiddenException(fileErrorResponse(code));
}

export function fileNotFound(code: FileErrorCode): NotFoundException {
  return new NotFoundException(fileErrorResponse(code));
}
