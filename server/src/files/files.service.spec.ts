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
    materials?: Array<Record<string, unknown>>;
    assignments?: Array<Record<string, unknown>>;
    submissions?: Array<Record<string, unknown>>;
    submittedAssignment?: Record<string, unknown> | null;
    canAccessCourseAssignment?: boolean;
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
  const materialModel = {
    find: jest.fn().mockReturnValue(chainResult(options.materials ?? [])),
  };
  const assignmentModel = {
    find: jest.fn().mockReturnValue(chainResult(options.assignments ?? [])),
    findById: jest
      .fn()
      .mockReturnValue(chainResult(options.submittedAssignment ?? null)),
  };
  const submissionModel = {
    find: jest.fn().mockReturnValue(chainResult(options.submissions ?? [])),
  };
  const academicAccessService = {
    canAccessCourseAssignment: jest
      .fn()
      .mockResolvedValue(options.canAccessCourseAssignment ?? false),
  };

  return new FilesService(
    fileModel as never,
    materialModel as never,
    assignmentModel as never,
    submissionModel as never,
    {
      onRollback: jest.fn().mockReturnValue(false),
      onCommit: jest.fn().mockReturnValue(false),
    } as never,
    academicAccessService as never,
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

  it('allows a student to download a course material file for their group', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const studentId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();

    const file = { _id: fileId, uploadedBy: ownerId };
    const service = createService({
      file,
      materials: [{ courseAssignment: courseAssignmentId }],
      canAccessCourseAssignment: true,
    });

    await expect(
      service.getDownloadableFileById(
        fileId.toHexString(),
        studentId.toHexString(),
        Role.STUDENT,
      ),
    ).resolves.toBe(file);
  });

  it('blocks an unselected student from elective course files', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const studentId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();
    const service = createService({
      file: { _id: fileId, uploadedBy: ownerId },
      materials: [{ courseAssignment: courseAssignmentId }],
      canAccessCourseAssignment: false,
    });

    await expect(
      service.getDownloadableFileById(
        fileId.toHexString(),
        studentId.toHexString(),
        Role.STUDENT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a student from downloading another student submission file from the same group', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const requesterId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();

    const service = createService({
      file: { _id: fileId, uploadedBy: ownerId },
      submissions: [
        {
          student: ownerId,
          assignment: new Types.ObjectId(),
        },
      ],
      submittedAssignment: { courseAssignment: courseAssignmentId },
      canAccessCourseAssignment: true,
    });

    await expect(
      service.getDownloadableFileById(
        fileId.toHexString(),
        requesterId.toHexString(),
        Role.STUDENT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects downloads when the file has no allowed relation to the user', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const service = createService({
      file: { _id: fileId, uploadedBy: ownerId },
      materials: [],
      assignments: [],
      submissions: [],
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
