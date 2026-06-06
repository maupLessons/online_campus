import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../../common/types/roles.enum';
import { SubmissionsService } from './submissions.service';

const query = <T>(value: T) => ({
  exec: jest.fn().mockResolvedValue(value),
  lean: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
});

const objectId = () => new Types.ObjectId();

describe('SubmissionsService security checks', () => {
  let service: SubmissionsService;
  let submissionModel: {
    paginate: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
  };
  let assignmentModel: {
    findById: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
  };
  let gradeModel: {
    updateOne: jest.Mock;
  };
  let filesService: {
    assertFilesCanBeAttached: jest.Mock;
  };
  let coursesService: {
    assertCourseAssignmentAccess: jest.Mock;
    validateOwnership: jest.Mock;
    findCourseAssignmentById: jest.Mock;
  };
  let notificationsService: {
    create: jest.Mock;
  };

  beforeEach(() => {
    submissionModel = {
      paginate: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn(),
    };
    assignmentModel = {
      findById: jest.fn(),
    };
    userModel = {
      findById: jest.fn(),
    };
    gradeModel = {
      updateOne: jest.fn(),
    };
    filesService = {
      assertFilesCanBeAttached: jest.fn(),
    };
    coursesService = {
      assertCourseAssignmentAccess: jest.fn().mockResolvedValue({}),
      validateOwnership: jest.fn().mockResolvedValue({}),
      findCourseAssignmentById: jest.fn(),
    };
    notificationsService = {
      create: jest.fn(),
    };

    service = new SubmissionsService(
      submissionModel as never,
      assignmentModel as never,
      gradeModel as never,
      userModel as never,
      filesService as never,
      coursesService as never,
      notificationsService as never,
    );
  });

  it('requires course ownership before listing submitted work', async () => {
    const assignmentId = objectId();
    const courseAssignmentId = objectId();
    const teacherId = objectId();
    const assignment = {
      _id: assignmentId,
      courseAssignment: courseAssignmentId,
    };

    assignmentModel.findById.mockReturnValue(query(assignment));
    submissionModel.paginate.mockResolvedValue({
      docs: [],
      totalDocs: 0,
      limit: 10,
      page: 1,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    });

    await service.findSubmissions(
      assignmentId.toHexString(),
      { page: 1, limit: 10 },
      teacherId.toHexString(),
      Role.TEACHER,
    );

    expect(coursesService.assertCourseAssignmentAccess).toHaveBeenCalledWith(
      courseAssignmentId.toHexString(),
      teacherId.toHexString(),
      Role.TEACHER,
    );
    const paginateCall = submissionModel.paginate.mock.calls[0] as [
      { assignment: Types.ObjectId; status: string },
      { populate: unknown },
    ];

    expect(paginateCall[0]).toEqual({
      assignment: assignmentId,
      status: 'submitted',
    });
    expect(paginateCall[1].populate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'student' }),
        expect.objectContaining({ path: 'files' }),
      ]),
    );
  });

  it('blocks students from deleting another student submission', async () => {
    await expect(
      service.removeSubmission(
        objectId().toHexString(),
        objectId().toHexString(),
        objectId().toHexString(),
        Role.STUDENT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assignmentModel.findById).not.toHaveBeenCalled();
    expect(submissionModel.deleteOne).not.toHaveBeenCalled();
  });

  it('allows a student to delete only their own submission after assignment access check', async () => {
    const assignmentId = objectId();
    const studentId = objectId();
    const groupId = objectId();
    const assignment = {
      _id: assignmentId,
      group: groupId,
      courseAssignment: objectId(),
      dueDate: new Date(Date.now() + 60_000),
    };
    const submission = { _id: objectId(), status: 'submitted' };

    assignmentModel.findById.mockReturnValue(query(assignment));
    submissionModel.findOne.mockReturnValue(query(submission));
    submissionModel.deleteOne.mockReturnValue(query({ deletedCount: 1 }));

    await expect(
      service.removeSubmission(
        assignmentId.toHexString(),
        studentId.toHexString(),
        studentId.toHexString(),
        Role.STUDENT,
      ),
    ).resolves.toEqual({ success: true });

    expect(submissionModel.deleteOne).toHaveBeenCalledWith({
      assignment: assignmentId,
      student: studentId,
    });
  });

  it('rejects malformed assignment ids before querying the database', async () => {
    await expect(
      service.findSubmissions(
        'not-a-mongo-id',
        { page: 1, limit: 10 },
        objectId().toHexString(),
        Role.TEACHER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(assignmentModel.findById).not.toHaveBeenCalled();
    expect(submissionModel.paginate).not.toHaveBeenCalled();
  });

  it('rejects malformed assignment ids before accepting uploaded work', async () => {
    await expect(
      service.submitAssignment(
        'not-a-mongo-id',
        { fileIds: [objectId().toHexString()] },
        objectId().toHexString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(assignmentModel.findById).not.toHaveBeenCalled();
    expect(filesService.assertFilesCanBeAttached).not.toHaveBeenCalled();
  });

  it('rejects malformed student ids before deleting submitted work', async () => {
    await expect(
      service.removeSubmission(
        objectId().toHexString(),
        'not-a-mongo-id',
        objectId().toHexString(),
        Role.TEACHER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(assignmentModel.findById).not.toHaveBeenCalled();
    expect(submissionModel.deleteOne).not.toHaveBeenCalled();
  });

  it('blocks submissions after the assignment deadline', async () => {
    const studentId = objectId();
    const groupId = objectId();
    const assignment = {
      _id: objectId(),
      group: groupId,
      courseAssignment: objectId(),
      dueDate: new Date(Date.now() - 60_000),
    };

    assignmentModel.findById.mockReturnValue(query(assignment));
    await expect(
      service.submitAssignment(
        assignment._id.toHexString(),
        { fileIds: [objectId().toHexString()] },
        studentId.toHexString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(filesService.assertFilesCanBeAttached).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('blocks deleting graded submissions for resubmission', async () => {
    const assignmentId = objectId();
    const studentId = objectId();
    const groupId = objectId();
    const assignment = {
      _id: assignmentId,
      group: groupId,
      courseAssignment: objectId(),
      dueDate: new Date(Date.now() + 60_000),
    };

    assignmentModel.findById.mockReturnValue(query(assignment));
    submissionModel.findOne.mockReturnValue(
      query({ _id: objectId(), status: 'graded' }),
    );

    await expect(
      service.removeSubmission(
        assignmentId.toHexString(),
        studentId.toHexString(),
        studentId.toHexString(),
        Role.STUDENT,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(submissionModel.deleteOne).not.toHaveBeenCalled();
  });

  it('returns submitted work for revision and archives its active grade', async () => {
    const submissionId = objectId();
    const assignmentId = objectId();
    const courseAssignmentId = objectId();
    const studentId = objectId();
    const reviewerId = objectId();
    const assignment = {
      _id: assignmentId,
      courseAssignment: courseAssignmentId,
      title: 'Course project',
      dueDate: new Date(Date.now() + 60_000),
    };
    const submission = {
      _id: submissionId,
      assignment,
      student: studentId,
      status: 'submitted',
      files: [],
      attemptNumber: 1,
      returnComment: null as string | null,
      returnedAt: null as Date | null,
      returnedBy: null as Types.ObjectId | null,
      score: undefined as number | undefined,
      comment: undefined as string | undefined,
      populate: jest.fn(),
      toObject: jest.fn(),
    };
    submission.populate.mockResolvedValue(submission);
    submission.toObject.mockReturnValue(submission);

    submissionModel.findById.mockReturnValue(query(submission));
    submissionModel.findOneAndUpdate.mockImplementation(
      (
        _filter: unknown,
        update: {
          $set: {
            status: string;
            attemptNumber: number;
            returnComment: string;
            returnedAt: Date;
            returnedBy: Types.ObjectId;
          };
        },
      ) => {
        Object.assign(submission, update.$set);
        submission.score = undefined;
        submission.comment = undefined;
        return query(submission);
      },
    );
    gradeModel.updateOne.mockReturnValue(query({ modifiedCount: 1 }));
    coursesService.findCourseAssignmentById.mockResolvedValue({
      courseName: 'Enterprise Systems',
    });
    notificationsService.create.mockResolvedValue({});

    await service.returnForRevision(
      submissionId.toHexString(),
      { comment: 'Please add the missing validation.' },
      reviewerId.toHexString(),
      Role.TEACHER,
    );

    expect(coursesService.validateOwnership).toHaveBeenCalledWith(
      courseAssignmentId.toHexString(),
      reviewerId.toHexString(),
      Role.TEACHER,
    );
    expect(submission.status).toBe('returned');
    expect(submission.returnComment).toBe('Please add the missing validation.');
    const gradeUpdateCall = gradeModel.updateOne.mock.calls[0] as unknown as [
      { submission: Types.ObjectId; status: { $ne: string } },
      {
        $set: {
          status: string;
          withdrawnAt: Date;
          withdrawalReason: string;
        };
      },
      { runValidators: boolean },
    ];
    expect(gradeUpdateCall[0]).toEqual({
      submission: submissionId,
      status: { $ne: 'withdrawn' },
    });
    expect(gradeUpdateCall[1].$set.status).toBe('withdrawn');
    expect(gradeUpdateCall[1].$set.withdrawalReason).toBe(
      'Please add the missing validation.',
    );
    expect(gradeUpdateCall[2]).toEqual({ runValidators: true });
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: studentId.toHexString(),
        type: 'assignment_returned',
        actionUrl: `/assignments?assignmentId=${assignmentId.toHexString()}`,
      }),
    );
  });

  it('accepts a corrected file only after a submission was returned', async () => {
    const assignmentId = objectId();
    const studentId = objectId();
    const fileId = objectId();
    const assignment = {
      _id: assignmentId,
      group: objectId(),
      courseAssignment: objectId(),
      title: 'Corrected work',
      dueDate: new Date(Date.now() + 60_000),
    };
    const existing = {
      _id: objectId(),
      assignment: assignmentId,
      student: studentId,
      files: [],
      status: 'returned',
      attemptNumber: 1,
      populate: jest.fn(),
      toObject: jest.fn(),
    };
    existing.populate.mockResolvedValue(existing);
    existing.toObject.mockReturnValue(existing);

    assignmentModel.findById.mockReturnValue(query(assignment));
    submissionModel.findOne.mockReturnValue(query(existing));
    submissionModel.findOneAndUpdate.mockImplementation(
      (
        _filter: unknown,
        update: {
          $set: { files: never[]; status: string; submittedAt: Date };
          $inc: { attemptNumber: number };
        },
      ) => {
        existing.files = update.$set.files;
        existing.status = update.$set.status;
        existing.attemptNumber += update.$inc.attemptNumber;
        return query(existing);
      },
    );

    const result = await service.submitAssignment(
      assignmentId.toHexString(),
      { fileIds: [fileId.toHexString()] },
      studentId.toHexString(),
    );

    expect(filesService.assertFilesCanBeAttached).toHaveBeenCalledWith(
      [fileId.toHexString()],
      studentId.toHexString(),
      Role.STUDENT,
    );
    expect(existing.status).toBe('submitted');
    expect(existing.attemptNumber).toBe(2);
    expect(result.status).toBe('submitted');
    expect(result.attemptNumber).toBe(2);
  });

  it('prevents duplicate revision transitions when another request wins the race', async () => {
    const submissionId = objectId();
    const reviewerId = objectId();
    const assignment = {
      _id: objectId(),
      courseAssignment: objectId(),
      title: 'Concurrent revision',
      dueDate: new Date(Date.now() + 60_000),
    };
    const submission = {
      _id: submissionId,
      assignment,
      student: objectId(),
      status: 'submitted',
      attemptNumber: 1,
    };

    submissionModel.findById.mockReturnValue(query(submission));
    submissionModel.findOneAndUpdate.mockReturnValue(query(null));

    await expect(
      service.returnForRevision(
        submissionId.toHexString(),
        { comment: 'Please revise this section.' },
        reviewerId.toHexString(),
        Role.TEACHER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(gradeModel.updateOne).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('preserves returned work until the student submits a corrected attempt', async () => {
    const assignmentId = objectId();
    const studentId = objectId();
    const assignment = {
      _id: assignmentId,
      group: objectId(),
      courseAssignment: objectId(),
      dueDate: new Date(Date.now() + 60_000),
    };

    assignmentModel.findById.mockReturnValue(query(assignment));
    submissionModel.findOne.mockReturnValue(
      query({ _id: objectId(), status: 'returned' }),
    );

    await expect(
      service.removeSubmission(
        assignmentId.toHexString(),
        studentId.toHexString(),
        studentId.toHexString(),
        Role.STUDENT,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(submissionModel.deleteOne).not.toHaveBeenCalled();
  });
});
