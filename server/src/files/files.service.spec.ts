import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FilesService } from './files.service';
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
    courseAssignment?: Record<string, unknown> | null;
    user?: Record<string, unknown> | null;
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
  const userModel = {
    findById: jest.fn().mockReturnValue(chainResult(options.user ?? null)),
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
  const courseAssignmentModel = {
    findById: jest
      .fn()
      .mockReturnValue(chainResult(options.courseAssignment ?? null)),
  };

  return new FilesService(
    fileModel as never,
    userModel as never,
    materialModel as never,
    assignmentModel as never,
    submissionModel as never,
    courseAssignmentModel as never,
    {
      onRollback: jest.fn().mockReturnValue(false),
      onCommit: jest.fn().mockReturnValue(false),
    } as never,
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
    const groupId = new Types.ObjectId();

    const file = { _id: fileId, uploadedBy: ownerId };
    const service = createService({
      file,
      materials: [{ courseAssignment: courseAssignmentId }],
      courseAssignment: {
        teacher: new Types.ObjectId(),
        group: groupId,
      },
      user: { studentProfile: { group: groupId } },
    });

    await expect(
      service.getDownloadableFileById(
        fileId.toHexString(),
        studentId.toHexString(),
        Role.STUDENT,
      ),
    ).resolves.toBe(file);
  });

  it('blocks a student from downloading another student submission file from the same group', async () => {
    const fileId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const requesterId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();
    const groupId = new Types.ObjectId();

    const service = createService({
      file: { _id: fileId, uploadedBy: ownerId },
      submissions: [
        {
          student: ownerId,
          assignment: new Types.ObjectId(),
        },
      ],
      submittedAssignment: { courseAssignment: courseAssignmentId },
      courseAssignment: {
        teacher: new Types.ObjectId(),
        group: groupId,
      },
      user: { studentProfile: { group: groupId } },
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
});
