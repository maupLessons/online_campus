import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AcademicTerm,
  AcademicTermDocument,
  ACADEMIC_YEAR_PATTERN,
} from './schemas/academic-term.schema';
import { NoCurrentTermException } from './no-current-term.exception';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AuthenticatedUser } from '../common/types/authenticated-request';

type DependentCounter = {
  countDocuments(filter: object): { exec(): Promise<number> };
};

@Injectable()
export class AcademicTermsService {
  constructor(
    @InjectModel(AcademicTerm.name)
    private readonly termModel: Model<AcademicTermDocument>,
    @InjectModel('CourseAssignment')
    private readonly courseAssignmentModel: DependentCounter,
    @InjectModel('ElectiveSelectionPeriod')
    private readonly electivePeriodModel: DependentCounter,
    @InjectModel('ElectiveDiscipline')
    private readonly electiveDisciplineModel: DependentCounter,
    private readonly auditLogService: AuditLogService,
  ) {}

  getCurrent(): Promise<AcademicTermDocument | null> {
    return this.termModel.findOne({ status: 'current' }).exec();
  }

  async requireCurrent(): Promise<AcademicTermDocument> {
    const current = await this.getCurrent();
    if (!current) throw new NoCurrentTermException();
    return current;
  }

  list(): Promise<AcademicTermDocument[]> {
    return this.termModel
      .find()
      .sort({ academicYear: -1, termNumber: -1 })
      .exec();
  }

  findById(id: string): Promise<AcademicTermDocument> {
    return this.findOrThrow(id);
  }

  async create(dto: CreateAcademicTermDto): Promise<AcademicTermDocument> {
    const firstYear = this.parseAcademicYear(dto.academicYear);
    const { startsAt, endsAt } = this.parseRange(dto.startsAt, dto.endsAt);
    await this.assertNoOverlap(
      dto.academicYear,
      dto.termNumber,
      startsAt,
      endsAt,
    );

    try {
      return await this.termModel.create({
        academicYear: dto.academicYear,
        termNumber: dto.termNumber,
        startsAt,
        endsAt,
        status: 'planned',
        maupAcademicYear: dto.maupAcademicYear ?? firstYear,
        maupSemester: dto.maupSemester ?? dto.termNumber,
      });
    } catch (error) {
      throw this.mapDuplicate(error);
    }
  }

  async update(
    id: string,
    dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermDocument> {
    const term = await this.findOrThrow(id);
    if (term.status !== 'planned') {
      throw new ConflictException('Редагувати можна лише запланований період');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : term.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : term.endsAt;
    this.parseRange(startsAt.toISOString(), endsAt.toISOString());
    await this.assertNoOverlap(
      term.academicYear,
      term.termNumber,
      startsAt,
      endsAt,
    );

    term.startsAt = startsAt;
    term.endsAt = endsAt;
    if (dto.maupAcademicYear !== undefined)
      term.maupAcademicYear = dto.maupAcademicYear;
    if (dto.maupSemester !== undefined) term.maupSemester = dto.maupSemester;
    return term.save();
  }

  async activate(
    id: string,
    actor: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<AcademicTermDocument> {
    const target = await this.findOrThrow(id);
    if (target.status === 'current') {
      throw new ConflictException('Цей період уже є поточним');
    }
    const previous = await this.getCurrent();
    const now = new Date();

    if (previous) {
      await this.termModel
        .updateOne(
          { _id: previous._id, status: 'current' },
          { $set: { status: 'closed', closedAt: now } },
        )
        .exec();
    }

    let activated: AcademicTermDocument | null;
    try {
      activated = await this.termModel
        .findOneAndUpdate(
          { _id: target._id, status: { $in: ['planned', 'closed'] } },
          {
            $set: {
              status: 'current',
              activatedAt: now,
              activatedBy: new Types.ObjectId(actor.sub),
              closedAt: null,
            },
          },
          { returnDocument: 'after' },
        )
        .exec();
    } catch (error) {
      throw this.mapDuplicate(error, 'Інший період уже активовано паралельно');
    }
    if (!activated)
      throw new ConflictException('Період змінився під час активації');

    const auditDetails = {
      before: previous
        ? {
            id: previous._id.toString(),
            academicYear: previous.academicYear,
            termNumber: previous.termNumber,
          }
        : null,
      after: {
        id: activated._id.toString(),
        academicYear: activated.academicYear,
        termNumber: activated.termNumber,
      },
    };

    if (audit) {
      // Captures the real request IP/UA and marks the request so the global
      // AuditInterceptor does not also append an `http-fallback` row.
      await audit.record({
        action: AUDIT_ACTIONS.ACADEMIC_TERM_ACTIVATE,
        targetEntity: 'academic_term',
        targetId: activated._id.toString(),
        details: auditDetails,
      });
    } else {
      // No request context (seed/system callers) — log directly as before.
      await this.auditLogService.logAction({
        userId: actor.sub,
        userLogin: actor.login,
        userRole: actor.role,
        action: AUDIT_ACTIONS.ACADEMIC_TERM_ACTIVATE,
        targetEntity: 'academic_term',
        targetId: activated._id.toString(),
        result: 'success',
        ipAddress: 'internal',
        userAgent: 'internal',
        details: auditDetails,
      });
    }

    return activated;
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const term = await this.findOrThrow(id);
    if (term.status !== 'planned') {
      throw new ConflictException('Видаляти можна лише запланований період');
    }
    const filter = { term: term._id };
    const [a, b, c] = await Promise.all([
      this.courseAssignmentModel.countDocuments(filter).exec(),
      this.electivePeriodModel.countDocuments(filter).exec(),
      this.electiveDisciplineModel.countDocuments(filter).exec(),
    ]);
    if (a + b + c > 0) {
      throw new ConflictException(
        'Період має залежні записи; видалення неможливе',
      );
    }
    await this.termModel.deleteOne({ _id: term._id }).exec();
    return { deleted: true };
  }

  private async findOrThrow(id: string): Promise<AcademicTermDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Період не знайдено');
    const term = await this.termModel.findById(id).exec();
    if (!term) throw new NotFoundException('Період не знайдено');
    return term;
  }

  private parseAcademicYear(value: string): number {
    if (!ACADEMIC_YEAR_PATTERN.test(value)) {
      throw new BadRequestException('academicYear має формат РРРР/РРРР');
    }
    const [first, second] = value.split('/').map(Number);
    if (second !== first + 1) {
      throw new BadRequestException('Другий рік має дорівнювати першому + 1');
    }
    return first;
  }

  private parseRange(
    startsAt: string,
    endsAt: string,
  ): { startsAt: Date; endsAt: Date } {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('endsAt має бути пізніше за startsAt');
    }
    return { startsAt: start, endsAt: end };
  }

  private async assertNoOverlap(
    academicYear: string,
    termNumber: 1 | 2,
    startsAt: Date,
    endsAt: Date,
  ) {
    const siblings = await this.termModel
      .find({ academicYear, termNumber: { $ne: termNumber } })
      .exec();
    const overlaps = siblings.some(
      (s) => s.startsAt < endsAt && startsAt < s.endsAt,
    );
    if (overlaps) {
      throw new BadRequestException(
        'Періоди одного навчального року не можуть перетинатися',
      );
    }
  }

  private mapDuplicate(
    error: unknown,
    message = 'Такий період уже існує',
  ): Error {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return new ConflictException(message);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
