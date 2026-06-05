import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    deleteOne: jest.Mock;
  };
  let assignmentModel: {
    findById: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
  };
  let filesService: {
    assertFilesCanBeAttached: jest.Mock;
  };
  let coursesService: {
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
      deleteOne: jest.fn(),
    };
    assignmentModel = {
      findById: jest.fn(),
    };
    userModel = {
      findById: jest.fn(),
    };
    filesService = {
      assertFilesCanBeAttached: jest.fn(),
    };
    coursesService = {
      validateOwnership: jest.fn(),
      findCourseAssignmentById: jest.fn(),
    };
    notificationsService = {
      create: jest.fn(),
    };

    service = new SubmissionsService(
      submissionModel as never,
      assignmentModel as never,
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
    coursesService.validateOwnership.mockResolvedValue({
      _id: courseAssignmentId,
    });
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

    expect(coursesService.validateOwnership).toHaveBeenCalledWith(
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
    const submission = { _id: objectId() };

    assignmentModel.findById.mockReturnValue(query(assignment));
    userModel.findById.mockReturnValue(
      query({
        studentProfile: { group: groupId },
      }),
    );
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
    userModel.findById.mockReturnValue(
      query({
        studentProfile: { group: groupId },
      }),
    );

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
    userModel.findById.mockReturnValue(
      query({
        studentProfile: { group: groupId },
      }),
    );
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
});
