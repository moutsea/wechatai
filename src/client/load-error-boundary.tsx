import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

type LoadErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey?: string;
};
type LoadErrorBoundaryState = { failed: boolean };

export function reloadPage() {
  // A new document also clears React.lazy's cached rejected import.
  window.location.reload();
}

export class LoadErrorBoundary extends Component<LoadErrorBoundaryProps, LoadErrorBoundaryState> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(
    previousProps: Readonly<LoadErrorBoundaryProps>,
    previousState: Readonly<LoadErrorBoundaryState>,
  ) {
    // Do not retry a new failure in the same update that changed the route.
    if (
      previousState.failed &&
      this.state.failed &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RouteLoadErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <LoadErrorBoundary
      resetKey={pathname}
      fallback={
        <main className="full-state" role="alert">
          <h1>页面未能加载</h1>
          <p>请检查网络后重新加载页面。</p>
          <button type="button" className="button" onClick={reloadPage}>
            重新加载页面
          </button>
          <a href="/">返回首页</a>
        </main>
      }
    >
      {children}
    </LoadErrorBoundary>
  );
}
