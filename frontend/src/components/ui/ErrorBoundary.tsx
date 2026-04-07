import { Component, type ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">⚡</div>
          <div>
            <p className="text-sm font-medium text-text">Something went wrong</p>
            <p className="text-xs text-text-dim mt-1 max-w-sm">
              {this.state.error.message ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => this.setState({ error: null })}
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
