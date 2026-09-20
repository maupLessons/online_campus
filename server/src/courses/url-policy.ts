import { BadRequestException } from '@nestjs/common';
import { isSafeHttpsUrl } from '../common/validators/https-url.validator';

// The shared isSafeHttpsUrl (plan 02) accepts only value and always applies
// its own 2048-character limit; the 500-character limit for external course links (§9.1)
// is checked here separately, since the validator isn't parameterized by length.
export const MAX_EXTERNAL_URL_LENGTH = 500;

export function parseHttpsUrl(value: string): URL {
  if (
    typeof value !== 'string' ||
    value.length > MAX_EXTERNAL_URL_LENGTH ||
    !isSafeHttpsUrl(value)
  ) {
    throw new BadRequestException(
      'Посилання має бути HTTPS, без облікових даних, на публічний хост і не довшим за 500 символів',
    );
  }
  return new URL(value.trim());
}

export function hostMatches(hostname: string, pattern: string): boolean {
  // Strip a single trailing dot (root FQDN, e.g. `bad.example.`) from both
  // sides, otherwise it bypasses the blocklist and wrongly breaks the allowlist (fix round 1).
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const target = pattern.toLowerCase().trim().replace(/\.$/, '');
  if (!target) return false;
  return host === target || host.endsWith(`.${target}`);
}

export function assertMoodleUrl(value: string, allowedHosts: string[]): string {
  const url = parseHttpsUrl(value);
  if (!allowedHosts.some((host) => hostMatches(url.hostname, host))) {
    throw new BadRequestException(
      'Посилання Moodle має вести на дозволений хост',
    );
  }
  return url.toString();
}

export function assertResourceUrl(
  value: string,
  blockedHosts: string[],
): string {
  const url = parseHttpsUrl(value);
  if (blockedHosts.some((host) => hostMatches(url.hostname, host))) {
    throw new BadRequestException('Цей хост заборонено для ресурсів');
  }
  return url.toString();
}

export function readHostList(
  raw: string | undefined,
  fallback: string[],
): string[] {
  if (raw === undefined || raw.trim() === '') return fallback;
  const hosts = raw
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  // A value made only of separators (e.g. ',,,') parses to an empty list —
  // we also return the fallback then, not an empty array (fix round 1).
  return hosts.length > 0 ? hosts : fallback;
}
