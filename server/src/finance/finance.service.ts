import { Injectable, Logger } from '@nestjs/common';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { ExternalDataCacheService } from '../external-data-cache/external-data-cache.service';
import { emptyExternalDataMeta } from '../external-data-cache/external-data-meta.dto';
import { StudentContextService } from '../external-data-cache/student-context.service';
import { MaupStudentApiClient } from '../integrations/maup-student-api/maup-student-api.client';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { MaupReferenceCacheService } from '../integrations/maup-student-api/maup-reference-cache.service';
import { MaupWireArray } from '../integrations/maup-student-api/maup-student-api.types';
import { emptyFinancePayload, FinanceDto, FinancePayload } from './finance.dto';
import { mapMaupFinance } from './finance.mapper';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly cache: ExternalDataCacheService,
    private readonly studentContext: StudentContextService,
    private readonly maupClient: MaupStudentApiClient,
    private readonly references: MaupReferenceCacheService,
    private readonly academicTerms: AcademicTermsService,
  ) {}

  async getMy(
    user: AuthenticatedUser,
    options: { force?: boolean },
  ): Promise<FinanceDto> {
    // Спека §5 п.1: немає активного профілю — це стан даних, а не помилка.
    const context = await this.studentContext.resolveStudentContext(user);
    if (!context) {
      return {
        ...emptyFinancePayload(),
        meta: emptyExternalDataMeta('no_active_profile'),
      };
    }

    // Фінанси не залежать від поточного навчального періоду, але спека 01
    // §7.3 перелічує /finance/my серед endpoint-ів із
    // meta.reason: 'no_current_term' (читається поза loader-ом, щоб
    // відображати стан на момент запиту, а не момент наповнення кешу).
    const term = await this.academicTerms.getCurrent();

    const result = await this.cache.resolve<FinancePayload>(
      {
        userId: context.userId,
        studentProfileId: context.studentProfileId,
        kind: 'finance',
      },
      async () => {
        const [saldo, payments, studentInfo, payPeriods] = await Promise.all([
          this.maupClient.getBalance(context.externalStudentId),
          this.maupClient.getPayments(context.externalStudentId),
          this.fetchStudentInfo(context.externalStudentId),
          this.references.getMap('payperiod'),
        ]);
        return mapMaupFinance(
          { saldo, payments, studentInfo },
          context.externalStudentId,
          { payPeriods },
        );
      },
      { force: options.force === true },
    );

    return {
      tuition: result.payload.tuition,
      dormitory: result.payload.dormitory,
      meta: {
        profileId: context.studentProfileId,
        fetchedAt: result.fetchedAt.toISOString(),
        stale: result.stale,
        ...(term === null ? { reason: 'no_current_term' as const } : {}),
      },
    };
  }

  /**
   * Fix round 1 (рев'ю батчу 3, правка A): `studentinfo` дає лише опціональні
   * `currentCost`/`currentPeriod` — баланс і історія платежів залежать тільки
   * від `saldo`/`payments`. Тому недоступність `studentinfo` не повинна
   * ставити хрест на всьому розділі фінансів (503/stale), як робив би провал
   * усередині `Promise.all` — це порушувало б NFR-REL-005 (часткові дані
   * замість зламаного розділу). Помилки `saldo`/`payments` лишаються
   * фатальними без змін.
   */
  private async fetchStudentInfo(
    externalStudentId: string,
  ): Promise<MaupWireArray> {
    try {
      return await this.maupClient.getStudentInfo(externalStudentId);
    } catch (error: unknown) {
      const errorKind =
        error instanceof MaupStudentApiError ? error.kind : 'unknown';
      this.logger.warn(
        `finance studentinfo unavailable errorKind=${errorKind}`,
      );
      return [];
    }
  }
}
