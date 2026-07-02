import axios from 'axios';

type LocalizedApiErrorPayload = {
  message?: unknown;
  messages?: Partial<Record<'uk' | 'en', unknown>>;
};

export function getLocalizedApiErrorMessage(
  error: unknown,
  language: string,
  fallback: string,
): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const data = error.response?.data as LocalizedApiErrorPayload | undefined;
  const locale = language.startsWith('en') ? 'en' : 'uk';
  const localizedMessage = data?.messages?.[locale];

  if (typeof localizedMessage === 'string' && localizedMessage.trim()) {
    return localizedMessage;
  }

  return fallback;
}
