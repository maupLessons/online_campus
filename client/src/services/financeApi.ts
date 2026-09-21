import api from './api';
import type { ExternalDataMeta } from './gradebookApi';

// Дзеркало `PaymentDto` (server/src/finance/finance.dto.ts): реальний контракт MAUP
// не має періоду на рівні окремого платежу — навмисно без поля `period`.
export interface Payment {
  date: string;
  amount: number;
  purpose?: string;
}

export interface FinanceDto {
  tuition: {
    balance: number;
    currency: 'UAH';
    currentCost?: number;
    currentPeriod?: string;
    payments: Payment[];
  };
  dormitory: { payments: Payment[] };
  meta: ExternalDataMeta;
}

export const TUITION_PAYMENT_URL =
  'https://maup.com.ua/ua/navchannya-u-maup/abiturientam2/oplata-navchannya.html';

export const financeQueryKeys = {
  my: (profileId: string | null) => ['finance', 'my', profileId] as const,
};

export const financeApi = {
  async getMy(): Promise<FinanceDto> {
    const { data } = await api.get<FinanceDto>('/finance/my');
    return data;
  },
  async refresh(): Promise<FinanceDto> {
    const { data } = await api.post<FinanceDto>('/finance/my/refresh');
    return data;
  },
};
