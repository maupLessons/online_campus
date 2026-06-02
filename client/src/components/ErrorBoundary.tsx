import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';

type ErrorBoundaryProps = {
  children: ReactNode;
  title: string;
  description: string;
  retryLabel: string;
  homeLabel?: string;
  resetKey?: string;
  compact?: boolean;
  onRetry?: () => void;
  onHome?: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('UI error boundary caught an error', error, errorInfo);
    }
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (
      this.state.error &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    const {
      children,
      title,
      description,
      retryLabel,
      homeLabel,
      compact = false,
      onHome,
    } = this.props;
    const { error } = this.state;

    if (!error) {
      return children;
    }

    return (
      <div
        className={
          compact
            ? 'rounded-lg border border-red-200 bg-white p-6 shadow-sm'
            : 'flex min-h-screen items-center justify-center bg-slate-50 p-6'
        }
        role="alert"
      >
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 text-red-700">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {description}
          </p>
          {import.meta.env.DEV && error.message && (
            <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-left text-xs text-slate-600">
              {error.message}
            </p>
          )}
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              {retryLabel}
            </button>
            {homeLabel && onHome && (
              <button
                type="button"
                onClick={onHome}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                {homeLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
