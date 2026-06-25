const DEFAULT_MOODLE_BASE_URL = "https://dist.maup.com.ua/";

function normalizeExternalUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return DEFAULT_MOODLE_BASE_URL;
    }
    return url.toString();
  } catch {
    return DEFAULT_MOODLE_BASE_URL;
  }
}

export const moodleBaseUrl = normalizeExternalUrl(
  import.meta.env.VITE_MOODLE_BASE_URL ?? DEFAULT_MOODLE_BASE_URL,
);
