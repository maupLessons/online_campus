import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AcademicTermsService } from './academic-terms.service';
import { AcademicTerm } from './schemas/academic-term.schema';
import { NoCurrentTermException } from './no-current-term.exception';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Role } from '../common/types/roles.enum';

type Query<T> = { exec: () => Promise<T> };
const q = <T>(value: T): Query<T> => ({ exec: () => Promise.resolve(value) });

type MockTermDoc = {
  _id: Types.ObjectId;
  status: string;
  academicYear: string;
  termNumber: 1 | 2;
  startsAt: Date;
  endsAt: Date;
  maupAcademicYear: number;
  maupSemester: number;
  save: jest.Mock;
};

describe('AcademicTermsService', () => {
  const model = {
    findOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
  };
  const dependents = { countDocuments: jest.fn(() => q(0)) };
  const auditLog = { logAction: jest.fn() };
  let service: AcademicTermsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AcademicTermsService,
        { provide: getModelToken(AcademicTerm.name), useValue: model },
        { provide: getModelToken('CourseAssignment'), useValue: dependents },
        {
          provide: getModelToken('ElectiveSelectionPeriod'),
          useValue: dependents,
        },
        { provide: getModelToken('ElectiveDiscipline'), useValue: dependents },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();
    service = moduleRef.get(AcademicTermsService);
  });

  it('getCurrent returns null when nothing is current', async () => {
    model.findOne.mockReturnValue(q(null));
    await expect(service.getCurrent()).resolves.toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ status: 'current' });
  });

  it('requireCurrent throws NoCurrentTermException', async () => {
    model.findOne.mockReturnValue(q(null));
    await expect(service.requireCurrent()).rejects.toBeInstanceOf(
      NoCurrentTermException,
    );
  });

  it('create derives maup fields from academicYear/termNumber', async () => {
    model.find.mockReturnValue(q([]));
    model.create.mockImplementation((doc) =>
      Promise.resolve({ ...doc, _id: new Types.ObjectId() }),
    );
    const created = await service.create({
      academicYear: '2026/2027',
      termNumber: 1,
      startsAt: '2026-09-01',
      endsAt: '2027-01-31',
    });
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        maupAcademicYear: 2026,
        maupSemester: 1,
        status: 'planned',
      }),
    );
    expect(created.status).toBe('planned');
  });

  it('create rejects non-consecutive academic year', async () => {
    await expect(
      service.create({
        academicYear: '2026/2028',
        termNumber: 1,
        startsAt: '2026-09-01',
        endsAt: '2027-01-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create rejects endsAt <= startsAt', async () => {
    await expect(
      service.create({
        academicYear: '2026/2027',
        termNumber: 1,
        startsAt: '2027-01-31',
        endsAt: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create rejects overlap with another term of the same year', async () => {
    model.find.mockReturnValue(
      q([
        {
          termNumber: 2,
          startsAt: new Date('2027-01-15'),
          endsAt: new Date('2027-06-30'),
        },
      ]),
    );
    await expect(
      service.create({
        academicYear: '2026/2027',
        termNumber: 1,
        startsAt: '2026-09-01',
        endsAt: '2027-01-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create maps duplicate key error to ConflictException', async () => {
    model.find.mockReturnValue(q([]));
    model.create.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 11000 }),
    );
    await expect(
      service.create({
        academicYear: '2026/2027',
        termNumber: 1,
        startsAt: '2026-09-01',
        endsAt: '2027-01-31',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('activate closes previous current, activates target and audits', async () => {
    const id = new Types.ObjectId();
    const prev = {
      _id: new Types.ObjectId(),
      academicYear: '2025/2026',
      termNumber: 2,
      status: 'current',
    };
    model.findById.mockReturnValue(
      q({
        _id: id,
        status: 'planned',
        academicYear: '2026/2027',
        termNumber: 1,
      }),
    );
    model.findOne.mockReturnValue(q(prev));
    model.updateOne.mockReturnValue(q({ modifiedCount: 1 }));
    model.findOneAndUpdate.mockReturnValue(
      q({
        _id: id,
        status: 'current',
        academicYear: '2026/2027',
        termNumber: 1,
      }),
    );
    const actor = {
      sub: new Types.ObjectId().toHexString(),
      login: 'admin',
      role: Role.ADMIN,
    };

    const result = await service.activate(id.toHexString(), actor);

    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: prev._id, status: 'current' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'closed' }) as unknown,
      }),
    );
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, status: { $in: ['planned', 'closed'] } },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'current' }) as unknown,
      }),
      expect.anything(),
    );
    expect(result.status).toBe('current');
    expect(auditLog.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'academic_term.activate',
        result: 'success',
      }),
    );
  });

  it('activate uses the provided audit context instead of logAction directly', async () => {
    const id = new Types.ObjectId();
    model.findById.mockReturnValue(
      q({
        _id: id,
        status: 'planned',
        academicYear: '2026/2027',
        termNumber: 1,
      }),
    );
    model.findOne.mockReturnValue(q(null));
    model.findOneAndUpdate.mockReturnValue(
      q({
        _id: id,
        status: 'current',
        academicYear: '2026/2027',
        termNumber: 1,
      }),
    );
    const actor = {
      sub: new Types.ObjectId().toHexString(),
      login: 'admin',
      role: Role.ADMIN,
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const result = await service.activate(id.toHexString(), actor, audit);

    expect(result.status).toBe('current');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'academic_term.activate',
        targetEntity: 'academic_term',
        targetId: id.toString(),
      }),
    );
    expect(auditLog.logAction).not.toHaveBeenCalled();
  });

  it('activate of already current term is a no-op conflict', async () => {
    const id = new Types.ObjectId();
    model.findById.mockReturnValue(q({ _id: id, status: 'current' }));
    await expect(
      service.activate(id.toHexString(), {
        sub: 'x',
        login: 'a',
        role: Role.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove refuses non-planned or referenced terms', async () => {
    const id = new Types.ObjectId();
    model.findById.mockReturnValue(q({ _id: id, status: 'closed' }));
    await expect(service.remove(id.toHexString())).rejects.toBeInstanceOf(
      ConflictException,
    );

    model.findById.mockReturnValue(q({ _id: id, status: 'planned' }));
    dependents.countDocuments.mockReturnValue(q(3));
    await expect(service.remove(id.toHexString())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  describe('update', () => {
    it('updates dates and maup fields of a planned term and returns the saved document', async () => {
      const id = new Types.ObjectId();
      const term: MockTermDoc = {
        _id: id,
        status: 'planned',
        academicYear: '2026/2027',
        termNumber: 1,
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2027-01-31'),
        maupAcademicYear: 2026,
        maupSemester: 1,
        save: jest.fn(),
      };
      term.save.mockImplementation(() => Promise.resolve(term));
      model.findById.mockReturnValue(q(term));
      model.find.mockReturnValue(q([]));

      const result = await service.update(id.toHexString(), {
        startsAt: '2026-10-01',
        endsAt: '2027-02-28',
        maupAcademicYear: 2030,
        maupSemester: 2,
      });

      expect(term.save).toHaveBeenCalledTimes(1);
      expect(result.startsAt).toEqual(new Date('2026-10-01'));
      expect(result.endsAt).toEqual(new Date('2027-02-28'));
      expect(result.maupAcademicYear).toBe(2030);
      expect(result.maupSemester).toBe(2);
    });

    it('throws ConflictException when the term is not planned', async () => {
      const id = new Types.ObjectId();

      model.findById.mockReturnValue(q({ _id: id, status: 'current' }));
      await expect(
        service.update(id.toHexString(), { maupSemester: 2 }),
      ).rejects.toBeInstanceOf(ConflictException);

      model.findById.mockReturnValue(q({ _id: id, status: 'closed' }));
      await expect(
        service.update(id.toHexString(), { maupSemester: 2 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for an unknown id', async () => {
      const id = new Types.ObjectId();
      model.findById.mockReturnValue(q(null));

      await expect(
        service.update(id.toHexString(), { maupSemester: 2 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('re-checks overlap against the new dates and rejects an overlapping range', async () => {
      const id = new Types.ObjectId();
      const term: MockTermDoc = {
        _id: id,
        status: 'planned',
        academicYear: '2026/2027',
        termNumber: 1,
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2027-01-31'),
        maupAcademicYear: 2026,
        maupSemester: 1,
        save: jest.fn(),
      };
      model.findById.mockReturnValue(q(term));
      model.find.mockReturnValue(
        q([
          {
            termNumber: 2,
            startsAt: new Date('2027-02-01'),
            endsAt: new Date('2027-06-30'),
          },
        ]),
      );

      await expect(
        service.update(id.toHexString(), { endsAt: '2027-03-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(term.save).not.toHaveBeenCalled();
    });
  });
});
