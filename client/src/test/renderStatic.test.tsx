import { describe, expect, it } from 'vitest';
import { useTranslation } from 'react-i18next';
import { renderStatic } from './renderStatic';

function Probe() {
  const { t } = useTranslation();
  return <span>{t('nav.profile')}</span>;
}

describe('renderStatic', () => {
  it('renders with uk translations by default', async () => {
    expect(await renderStatic(<Probe />)).toContain('Профіль');
  });
  it('renders en when requested', async () => {
    expect(await renderStatic(<Probe />, 'en')).toContain('Profile');
  });
});
