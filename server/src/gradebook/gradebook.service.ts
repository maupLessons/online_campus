import { Injectable } from '@nestjs/common';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { ExternalDataCacheService } from '../external-data-cache/external-data-cache.service';
import { emptyExternalDataMeta } from '../external-data-cache/external-data-meta.dto';
import { StudentContextService } from '../external-data-cache/student-context.service';
import { MaupStudentApiClient } from '../integrations/maup-student-api/maup-student-api.client';
import { MaupReferenceCacheService } from '../integrations/maup-student-api/maup-reference-cache.service';
import { GradebookDto, GradebookSemesterDto } from './gradebook.dto';
import { mapMaupMarks } from './gradebook.mapper';

export type GradebookOptions = {
  force?: boolean;
  academicYear?: string;
  semester?: number;
};

@Injectable()
export class GradebookService {
  constructor(
    private readonly cache: ExternalDataCacheService,
    private readonly studentContext: StudentContextService,
    private readonly maupClient: MaupStudentApiClient,
    private readonly references: MaupReferenceCacheService,
    private readonly academicTerms: AcademicTermsService,
  ) {}

  async getMy(
    user: AuthenticatedUser,
    options: GradebookOptions,
  ): Promise<GradebookDto> {
    // Спека §5 п.1: немає активного профілю — це стан даних, а не помилка.
    const context = await this.studentContext.resolveStudentContext(user);
    if (!context) {
      return {
        semesters: [],
        meta: emptyExternalDataMeta('no_active_profile'),
      };
    }

    // Читається поза loader-ом: `meta.reason` має відображати стан на момент
    // запиту, а не на момент наповнення кешу (спека §5 п.7).
    const term = await this.academicTerms.getCurrent();
    const current = term
      ? {
          maupAcademicYear: term.maupAcademicYear,
          maupSemester: term.maupSemester,
        }
      : null;

    const result = await this.cache.resolve<GradebookSemesterDto[]>(
      {
        userId: context.userId,
        studentProfileId: context.studentProfileId,
        kind: 'gradebook',
      },
      async () => {
        const [rows, markTypes, testTypes] = await Promise.all([
          this.maupClient.getMarks(context.externalStudentId),
          this.references.getMap('marktypes'),
          this.references.getMap('testtypes'),
        ]);
        return mapMaupMarks(
          rows,
          context.externalStudentId,
          { markTypes, testTypes },
          current,
        );
      },
      { force: options.force === true },
    );

    const semesters = result.payload.filter(
      (item) =>
        (options.academicYear === undefined ||
          item.academicYear === options.academicYear) &&
        (options.semester === undefined || item.semester === options.semester),
    );

    return {
      semesters,
      meta: {
        profileId: context.studentProfileId,
        fetchedAt: result.fetchedAt.toISOString(),
        stale: result.stale,
        ...(current === null ? { reason: 'no_current_term' as const } : {}),
      },
    };
  }
}
