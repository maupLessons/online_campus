const initial = (value?: string) => (value?.trim() ? `${value.trim()[0]}.` : '');

export function formatShortName(
  lastName?: string,
  firstName?: string,
  middleName?: string,
): string {
  if (lastName && !firstName && !middleName && lastName.trim().includes(' ')) {
    const [l, f, m] = lastName.trim().split(/\s+/);
    return formatShortName(l, f, m);
  }
  const parts = [lastName?.trim(), initial(firstName), initial(middleName)].filter(Boolean);
  return parts.join(' ');
}
