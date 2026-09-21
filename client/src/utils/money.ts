/** FIN-001: суми форматуються за локаллю інтерфейсу; знак не інтерпретується тут — лише сервером/кольором виклику. */
export function formatMoney(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
