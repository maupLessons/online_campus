import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';

type RouteErrorBoundaryProps = {
  children: ReactNode;
  compact?: boolean;
};

export default function RouteErrorBoundary({
  children,
  compact,
}: RouteErrorBoundaryProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <ErrorBoundary
      compact={compact}
      resetKey={`${location.pathname}${location.search}`}
      title={t('errors.boundary.title')}
      description={t('errors.boundary.description')}
      retryLabel={t('errors.boundary.retry')}
      homeLabel={t('errors.boundary.home')}
      onRetry={() => window.location.reload()}
      onHome={() => navigate('/dashboard', { replace: true })}
    >
      {children}
    </ErrorBoundary>
  );
}
