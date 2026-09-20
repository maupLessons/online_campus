import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { DomainAuditEvent } from '../audit-log/audit-context';
import {
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../common/export';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { ScheduleService } from './schedule.service';

const termId = new Types.ObjectId();
const term = { _id: termId, maupSemester: 1, maupAcademicYear: 2026 };
const groupId = new Types.ObjectId();

function makeService(opts: {
  enabled?: boolean;
  group?: unknown;
  groups?: unknown[];
  student?: unknown;
  students?: unknown[];
  getOrRefreshImpl?: jest.Mock;
}) {
  const reader = {
    findMy: jest
      .fn()
      .mockResolvedValue({ entries: [], meta: { stale: false } }),
    findToday: jest.fn().mockResolvedValue({
      date: '2026-09-07',
      lessons: [],
      session: [],
      meta: { stale: false },
    }),
    findForGroup: jest.fn().mockResolvedValue({
      groupCode: 'КН-11',
      isExamSession: false,
      periodFrom: null,
      periodTo: null,
      fetchedAt: null,
      stale: false,
      entries: [],
    }),
    findUpcomingForAssignment: jest.fn().mockResolvedValue([]),
  };
  const exporter = {
    export: jest.fn().mockResolvedValue({
      buffer: Buffer.from(''),
      filename: 'schedule.csv',
      contentType: 'text/csv; charset=utf-8',
    }),
  };
  const snapshots = {
    isEnabled: jest.fn().mockReturnValue(opts.enabled ?? true),
    getOrRefresh:
      opts.getOrRefreshImpl ??
      jest
        .fn()
        .mockResolvedValue({ snapshot: {}, stale: false, refreshed: true }),
  };
  const terms = { requireCurrent: jest.fn().mockResolvedValue(term) };
  const chain = <T>(value: T) => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });
  // Final wave I2: refreshOne iterates candidates via find(), not findOne().
  const userModel = {
    find: jest
      .fn()
      .mockReturnValue(
        chain(opts.students ?? (opts.student ? [opts.student] : [])),
      ),
  };
  const groupModel = {
    findOne: jest
      .fn()
      .mockReturnValue(
        chain('group' in opts ? opts.group : { _id: groupId, code: 'КН-11' }),
      ),
    find: jest.fn().mockReturnValue(chain(opts.groups ?? [])),
  };
  const service = new ScheduleService(
    reader as never,
    exporter as never,
    snapshots as never,
    terms as never,
    userModel as never,
    groupModel as never,
  );
  return { service, reader, exporter, snapshots, terms, userModel, groupModel };
}

const admin: AuthenticatedUser = {
  sub: new Types.ObjectId().toHexString(),
  login: 'a',
  role: Role.ADMIN,
};
const teacher: AuthenticatedUser = {
  sub: new Types.ObjectId().toHexString(),
  login: 't',
  role: Role.TEACHER,
};

describe('ScheduleService — read delegation', () => {
  it('findMy delegates to reader.findMy with isExamSession=false', async () => {
    const { service, reader } = makeService({});
    const query = { from: '2026-09-01' };
    await service.findMy(admin, query);
    expect(reader.findMy).toHaveBeenCalledWith(admin, query, false);
  });

  it('findSession delegates to reader.findMy with isExamSession=true', async () => {
    const { service, reader } = makeService({});
    const query = {};
    await service.findSession(admin, query);
    expect(reader.findMy).toHaveBeenCalledWith(admin, query, true);
  });

  it('findToday delegates to reader.findToday', async () => {
    const { service, reader } = makeService({});
    await service.findToday(admin);
    expect(reader.findToday).toHaveBeenCalledWith(admin);
  });

  it('findForGroup delegates to reader.findForGroup', async () => {
    const { service, reader } = makeService({});
    await service.findForGroup(admin, 'КН-11', {}, true);
    expect(reader.findForGroup).toHaveBeenCalledWith(admin, 'КН-11', {}, true);
  });

  it('findUpcomingForAssignment delegates to reader with default limit 5', async () => {
    const { service, reader } = makeService({});
    await service.findUpcomingForAssignment('assignment-1');
    expect(reader.findUpcomingForAssignment).toHaveBeenCalledWith(
      'assignment-1',
      5,
    );
  });

  it('findUpcomingForAssignment forwards a custom limit', async () => {
    const { service, reader } = makeService({});
    await service.findUpcomingForAssignment('assignment-1', 2);
    expect(reader.findUpcomingForAssignment).toHaveBeenCalledWith(
      'assignment-1',
      2,
    );
  });
});

describe('ScheduleService.export', () => {
  it('reads the personal schedule via the range fields and forwards entries to the exporter', async () => {
    const { service, reader, exporter } = makeService({});
    reader.findMy.mockResolvedValue({
      entries: [{ id: 'a' }],
      meta: { stale: false },
    });

    await service.export(admin, {
      from: '2026-09-01',
      to: '2026-09-07',
      format: SpreadsheetExportFormat.XLSX,
      locale: SpreadsheetExportLocale.EN,
      session: 'true',
    });

    expect(reader.findMy).toHaveBeenCalledWith(
      admin,
      { from: '2026-09-01', to: '2026-09-07' },
      true,
    );
    expect(exporter.export).toHaveBeenCalledWith(
      [{ id: 'a' }],
      SpreadsheetExportFormat.XLSX,
      SpreadsheetExportLocale.EN,
      true,
    );
  });

  it('treats a missing session flag as the lesson schedule', async () => {
    const { service, reader, exporter } = makeService({});
    await service.export(admin, {});
    expect(reader.findMy).toHaveBeenCalledWith(admin, {}, false);
    expect(exporter.export).toHaveBeenCalledWith(
      [],
      undefined,
      undefined,
      false,
    );
  });
});

describe('ScheduleService.refreshGroup', () => {
  it('forbids non-admin roles', async () => {
    const { service } = makeService({});
    await expect(
      service.refreshGroup(teacher, 'КН-11', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s for an unknown group', async () => {
    const { service } = makeService({ group: null });
    await expect(
      service.refreshGroup(admin, 'НЕМА-1', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the group has no active student to source the API lookup', async () => {
    const { service } = makeService({ student: null });
    await expect(
      service.refreshGroup(admin, 'КН-11', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refreshes both snapshots when session is not specified and records the audit entry', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const { service, snapshots, reader } = makeService({
      student: {
        studentProfiles: [
          {
            group: groupId,
            status: 'active',
            externalStudentId: 'ext-1',
            recordBookNumber: 'RB-1',
          },
        ],
      },
    });

    await service.refreshGroup(admin, 'КН-11', undefined, { record });

    expect(snapshots.getOrRefresh).toHaveBeenCalledTimes(2);
    expect(snapshots.getOrRefresh).toHaveBeenNthCalledWith(
      1,
      {
        groupCode: 'КН-11',
        termId: termId.toHexString(),
        isExamSession: false,
      },
      term,
      { studentId: 'ext-1', recordBookNumber: 'RB-1', actorUserId: admin.sub },
      { force: true },
    );
    expect(snapshots.getOrRefresh).toHaveBeenNthCalledWith(
      2,
      { groupCode: 'КН-11', termId: termId.toHexString(), isExamSession: true },
      term,
      { studentId: 'ext-1', recordBookNumber: 'RB-1', actorUserId: admin.sub },
      { force: true },
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.SCHEDULE_SNAPSHOT_REFRESH,
        targetEntity: 'schedule-snapshot',
        targetId: 'КН-11',
      }),
    );
    expect(record.mock.calls[0][0].details).toMatchObject({
      status: 'updated',
    });
    expect(reader.findForGroup).toHaveBeenCalledWith(admin, 'КН-11', {}, false);
  });

  it('refreshes only the requested session when session is explicitly set', async () => {
    const { service, snapshots } = makeService({
      student: {
        studentProfiles: [
          { group: groupId, status: 'active', externalStudentId: 'ext-1' },
        ],
      },
    });

    await service.refreshGroup(admin, 'КН-11', true);

    expect(snapshots.getOrRefresh).toHaveBeenCalledTimes(1);
    expect(snapshots.getOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ isExamSession: true }),
      term,
      expect.anything(),
      { force: true },
    );
  });

  it('skips the API call when the integration is disabled but still returns the cached view', async () => {
    const { service, snapshots, reader } = makeService({ enabled: false });

    const result = await service.refreshGroup(admin, 'КН-11', undefined);

    expect(snapshots.getOrRefresh).not.toHaveBeenCalled();
    expect(reader.findForGroup).toHaveBeenCalledWith(admin, 'КН-11', {}, false);
    expect(result).toBeDefined();
  });

  // Final wave I2: findOne() returned only ONE candidate — if they had no
  // externalStudentId, the group was wrongly marked no_source_student, even though another student in the group had an id.
  it('proceeds with the second candidate when the first active student has no externalStudentId', async () => {
    const { service, snapshots } = makeService({
      students: [
        {
          studentProfiles: [
            { group: groupId, status: 'active', externalStudentId: '' },
          ],
        },
        {
          studentProfiles: [
            {
              group: groupId,
              status: 'active',
              externalStudentId: 'ext-2',
              recordBookNumber: 'RB-2',
            },
          ],
        },
      ],
    });

    await service.refreshGroup(admin, 'КН-11', true);

    expect(snapshots.getOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ isExamSession: true }),
      term,
      expect.objectContaining({ studentId: 'ext-2' }),
      { force: true },
    );
  });

  it('records a failed status when the upstream refresh stays stale', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const { service } = makeService({
      student: {
        studentProfiles: [
          { group: groupId, status: 'active', externalStudentId: 'ext-1' },
        ],
      },
      getOrRefreshImpl: jest
        .fn()
        .mockResolvedValue({ snapshot: null, stale: true, refreshed: false }),
    });

    await service.refreshGroup(admin, 'КН-11', undefined, { record });

    expect(record.mock.calls[0][0].details).toMatchObject({
      status: 'failed',
      reason: 'upstream_error',
    });
  });
});

describe('ScheduleService.refreshAll', () => {
  it('forbids non-admin roles', async () => {
    const { service } = makeService({});
    await expect(service.refreshAll(teacher)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('walks every group of the current term and records an aggregate audit entry', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const groupA = new Types.ObjectId();
    const groupB = new Types.ObjectId();
    const { service, userModel } = makeService({
      groups: [
        { _id: groupA, code: 'КН-11' },
        { _id: groupB, code: 'КН-12' },
      ],
    });
    userModel.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            studentProfiles: [
              { group: groupA, status: 'active', externalStudentId: 'ext-a' },
            ],
          },
        ]),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

    const result = await service.refreshAll(admin, { record });

    expect(result.groups).toEqual([
      { groupCode: 'КН-11', status: 'updated' },
      { groupCode: 'КН-12', status: 'skipped', reason: 'no_source_student' },
    ]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.SCHEDULE_SNAPSHOT_REFRESH,
        targetEntity: 'schedule-snapshot',
        targetId: termId.toHexString(),
        details: { updated: 1, skipped: 1, failed: 0 },
      }),
    );
  });

  it('does not stop the walk when one group fails to refresh', async () => {
    const groupA = new Types.ObjectId();
    const { service } = makeService({
      groups: [{ _id: groupA, code: 'КН-11' }],
      student: {
        studentProfiles: [
          { group: groupA, status: 'active', externalStudentId: 'ext-a' },
        ],
      },
      getOrRefreshImpl: jest
        .fn()
        .mockResolvedValue({ snapshot: null, stale: true, refreshed: false }),
    });

    const result = await service.refreshAll(admin);

    expect(result.groups).toEqual([
      { groupCode: 'КН-11', status: 'failed', reason: 'upstream_error' },
    ]);
  });
});
