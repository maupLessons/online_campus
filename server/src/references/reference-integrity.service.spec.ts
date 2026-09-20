import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReferenceIntegrityService } from './reference-integrity.service';

type CountModelMock = {
  countDocuments: jest.Mock;
};

function countQuery(count: number) {
  return {
    exec: jest.fn().mockResolvedValue(count),
  };
}

function modelWithCount(count = 0): CountModelMock {
  return {
    countDocuments: jest.fn().mockReturnValue(countQuery(count)),
  };
}

function createService(
  overrides: {
    departmentCount?: number;
    groupCount?: number;
    userCounts?: number[];
    courseCount?: number;
    courseAssignmentCount?: number;
    surveyCount?: number;
    electiveDisciplineCount?: number;
    electivePeriodCount?: number;
    electiveSelectionCount?: number;
    notificationCount?: number;
  } = {},
) {
  const userCounts = overrides.userCounts ?? [0, 0];
  const userModel: CountModelMock = {
    countDocuments: jest
      .fn()
      .mockReturnValueOnce(countQuery(userCounts[0] ?? 0))
      .mockReturnValueOnce(countQuery(userCounts[1] ?? 0)),
  };

  const service = new ReferenceIntegrityService(
    modelWithCount(overrides.departmentCount) as never,
    modelWithCount(overrides.groupCount) as never,
    userModel as never,
    modelWithCount(overrides.courseCount) as never,
    modelWithCount(overrides.courseAssignmentCount) as never,
    modelWithCount(overrides.surveyCount) as never,
    modelWithCount(overrides.electiveDisciplineCount) as never,
    modelWithCount(overrides.electivePeriodCount) as never,
    modelWithCount(overrides.electiveSelectionCount) as never,
    modelWithCount(overrides.notificationCount) as never,
  );

  return { service, userModel };
}

describe('ReferenceIntegrityService', () => {
  const id = new Types.ObjectId();

  it('allows deleting a reference when no related documents exist', async () => {
    const { service } = createService();

    await expect(
      service.assertFacultyCanBeDeleted(id),
    ).resolves.toBeUndefined();
    await expect(
      service.assertDepartmentCanBeDeleted(id),
    ).resolves.toBeUndefined();
    await expect(service.assertGroupCanBeDeleted(id)).resolves.toBeUndefined();
    await expect(
      service.assertSpecialtyCanBeDeleted(id),
    ).resolves.toBeUndefined();
  });

  it('blocks deleting faculties that still have departments', async () => {
    const { service } = createService({ departmentCount: 2 });

    await expect(service.assertFacultyCanBeDeleted(id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('blocks deleting departments used by courses, teachers, or electives', async () => {
    const { service } = createService({
      courseCount: 1,
      userCounts: [3, 0],
      electiveDisciplineCount: 1,
    });

    await expect(service.assertDepartmentCanBeDeleted(id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('blocks deleting groups used by academic or communication records', async () => {
    const { service } = createService({
      userCounts: [4, 0],
      courseAssignmentCount: 2,
      surveyCount: 1,
      electivePeriodCount: 1,
      electiveSelectionCount: 1,
      notificationCount: 1,
    });

    await expect(service.assertGroupCanBeDeleted(id)).rejects.toThrow(
      ConflictException,
    );
  });

  // The schedule is read from MAUP API snapshots and stores the classroom as a string (spec 02 §4.1),
  // so the classrooms reference book is no longer blocked by anything — the check became a no-op.
  it('allows deleting a classroom (schedule no longer references the classroom reference)', async () => {
    const { service } = createService();

    await expect(
      service.assertClassroomCanBeDeleted(id),
    ).resolves.toBeUndefined();
  });
});
