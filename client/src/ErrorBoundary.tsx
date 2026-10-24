import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * The fallback for the Shell's own features. A caught error never reaches `window`, so it is
 * reported with the standard `reportError`, which the browser agent captures.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    reportError(error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
