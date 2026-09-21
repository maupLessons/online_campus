import axios from 'axios';

export type ExternalDataErrorCode = 'maup_unavailable' | 'maup_disabled' | 'unknown';

// Лише інфраструктурні стани (спека §5): стани даних (no_active_profile, no_current_term)
// приходять як 200 + meta.reason, а не як помилка.
const KNOWN: ExternalDataErrorCode[] = ['maup_unavailable', 'maup_disabled'];

export function getExternalDataErrorCode(error: unknown): ExternalDataErrorCode {
  if (!axios.isAxiosError(error)) return 'unknown';
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && (KNOWN as string[]).includes(code)
    ? (code as ExternalDataErrorCode)
    : 'unknown';
}
