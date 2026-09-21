import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ExternalDataStatusBar from '../../components/external/ExternalDataStatusBar';
import { useActiveStudentProfile } from '../../hooks/useActiveStudentProfile';
import {
  financeApi,
  financeQueryKeys,
  TUITION_PAYMENT_URL,
  type Payment,
} from '../../services/financeApi';
import { getExternalDataErrorCode } from '../../utils/externalDataError';
import { formatMoney } from '../../utils/money';

function PaymentsTable({ payments, locale, emptyText }: { payments: Payment[]; locale: string; emptyText: string }) {
  const { t } = useTranslation();
  if (payments.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">{t('finance.columns.date')}</th>
            <th className="px-4 py-2">{t('finance.columns.amount')}</th>
            <th className="px-4 py-2">{t('finance.columns.purpose')}</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment, index) => (
            <tr key={`${payment.date}-${index}`} className="border-t border-slate-100">
              <td className="px-4 py-3">{payment.date}</td>
              <td className="px-4 py-3 font-medium">{formatMoney(payment.amount, locale)}</td>
              <td className="px-4 py-3 text-slate-600">{payment.purpose ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinancePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const profile = useActiveStudentProfile();
  const profileId = profile?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: financeQueryKeys.my(profileId),
    queryFn: financeApi.getMy,
    enabled: profileId !== null,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: financeApi.refresh,
    onSuccess: (data) => queryClient.setQueryData(financeQueryKeys.my(profileId), data),
  });

  const errorCode = query.isError ? getExternalDataErrorCode(query.error) : null;
  // Спека §6: `no_active_profile` — порожній розділ із поясненням, не помилка.
  const errorText =
    errorCode === 'maup_disabled'
      ? t('externalData.disabled')
      : errorCode
        ? t('externalData.unavailable')
        : query.data?.meta.reason === 'no_active_profile'
          ? t('externalData.noProfile')
          : null;

  const tuition = query.data?.tuition;
  // FIN-001: відʼємний баланс — червоний, додатний — зелений.
  const balanceClass = tuition && tuition.balance < 0 ? 'text-red-600' : 'text-emerald-600';

  const payButton = (
    <a
      href={TUITION_PAYMENT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
      {t('finance.pay')}
    </a>
  );

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] bg-gradient-to-br from-blue-700 to-slate-900 p-8 text-white">
        <h1 className="text-3xl font-bold tracking-tight">{t('finance.title')}</h1>
        <p className="mt-2 text-sm text-blue-100">{t('finance.subtitle')}</p>
      </header>

      <ExternalDataStatusBar
        fetchedAt={query.data?.meta.fetchedAt ?? undefined}
        stale={query.data?.meta.stale}
        isRefreshing={refresh.isPending}
        onRefresh={() => refresh.mutate()}
      />

      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">{t('finance.tuition.title')}</h2>
        {query.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">{t('common.loading')}</p>
        ) : errorText ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">{errorText}</p>
            {payButton}
          </div>
        ) : tuition ? (
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">{t('finance.tuition.balance')}</p>
              <p className={`text-4xl font-bold ${balanceClass}`}>{formatMoney(tuition.balance, locale)}</p>
              {tuition.currentCost !== undefined && (
                <p className="mt-1 text-sm text-slate-600">
                  {t('finance.tuition.currentCost', {
                    period: tuition.currentPeriod ?? t('finance.tuition.currentPeriodFallback'),
                    amount: formatMoney(tuition.currentCost, locale),
                  })}
                </p>
              )}
            </div>
            {payButton}
            <h3 className="text-sm font-semibold text-slate-700">{t('finance.tuition.history')}</h3>
            <PaymentsTable payments={tuition.payments} locale={locale} emptyText={t('finance.tuition.empty')} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t('finance.tuition.noData')}</p>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">{t('finance.dormitory.title')}</h2>
        <div className="mt-4">
          {query.isLoading ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : errorText ? (
            <p className="text-sm text-slate-600">{errorText}</p>
          ) : (
            <PaymentsTable
              payments={query.data?.dormitory.payments ?? []}
              locale={locale}
              emptyText={t('finance.dormitory.empty')}
            />
          )}
        </div>
      </section>

      {refresh.isError && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
          {t('externalData.unavailable')}
        </p>
      )}
    </div>
  );
}
