import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FileScanStatus } from './file.schema';
import { FilesService } from './files.service';
import { FileErrorCode } from './file-errors';
import { Role } from '../common/types/roles.enum';

type QueryChain<T> = {
  select: jest.Mock<QueryChain<T>, []>;
  lean: jest.Mock<QueryChain<T>, []>;
  exec: jest.Mock<Promise<T>, []>;
};

function chainResult<T>(value: T) {
  const chain = {} as QueryChain<T>;

  Object.assign(chain, {
    select: jest.fn<QueryChain<T>, []>(() => chain),
    lean: jest.fn<QueryChain<T>, []>(() => chain),
    exec: jest.fn().mockResolvedValue(value),
  });

  return chain;
}

function createService(
  options: {
    file?: Record<string, unknown> | null;
    attachedFilesCount?: number;
  } = {},
) {
  const fileModel = {
    findById: jest.fn().mockResolvedValue(options.file ?? null),
    countDocuments: jest
      .fn()
      .mockReturnValue(chainResult(options.attachedFilesCount ?? 0)),
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  return new FilesService(
    fileModel as never,
    {
      onRollback: jest.fn().mockReturnValue(false),
      onCommit: jest.fn().mockReturnValue(false),
    } as never,
    {
      scan: jest.fn().mockResolvedValue({
        status: FileScanStatus.CLEAN,
        provider: 'test-scanner',
      }),
    },
  );
}

describe('FilesService security checks', () => {
  it('blocks non-admin users from attaching files they do not own', async () => {
    const service = createService({ attachedFilesCount: 0 });
    const fileId = new Types.ObjectId().toHexString();
    const userId = new Types.ObjectId().toHexString();

    await expect(
      service.assertFilesCanBeAttached([fileId], userId, Role.STUDENT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the uploader to download their own file', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const file = { _id: fileId, uploadedBy: ownerId };
    const service = createService({ file });

    await expect(
      service.getDownloadableFileById(
        fileId.toHexString(),
        ownerId.toHexString(),
        Role.STUDENT,
      ),
    ).resolves.toBe(file);
  });

  it('allows an admin to download any file', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const adminId = new Types.ObjectId();
    const file = { _id: fileId, uploadedBy: ownerId };
    const service = createService({ file });

    await expect(
      service.getDownloadableFileById(
        fileId.toHexString(),
        adminId.toHexString(),
        Role.ADMIN,
      ),
    ).resolves.toBe(file);
  });

  it('rejects downloads when the requester neither owns the file nor is an admin', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const service = createService({
      file: { _id: fileId, uploadedBy: ownerId },
    });

    await expect(
      service.getDownloadableFileById(
        fileId.toHexString(),
        userId.toHexString(),
        Role.STUDENT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks downloads before a file is marked clean by the scanner', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const service = createService({
      file: {
        _id: fileId,
        uploadedBy: ownerId,
        scanStatus: FileScanStatus.PENDING_SCAN,
      },
    });

    try {
      await service.getDownloadableFileById(
        fileId.toHexString(),
        ownerId.toHexString(),
        Role.STUDENT,
      );
      throw new Error('Expected pending scan download to be blocked');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse() as {
        code?: unknown;
        message?: unknown;
        messages?: {
          uk?: unknown;
          en?: unknown;
        };
      };
      expect(response.code).toBe(FileErrorCode.PENDING_SCAN);
      expect(typeof response.message).toBe('string');
      expect(typeof response.messages?.uk).toBe('string');
      expect(typeof response.messages?.en).toBe('string');
    }
  });
});
