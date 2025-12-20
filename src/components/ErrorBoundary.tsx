import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Unhandled app error", { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-lg w-full rounded-2xl border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground mb-2">A apărut o eroare</h1>
            <p className="text-sm text-muted-foreground mb-4">
              Aplicația a întâmpinat o problemă neașteptată.
            </p>
            <pre className="text-xs whitespace-pre-wrap rounded-lg bg-muted p-3 overflow-auto">
              {this.state.message}
            </pre>
            <div className="mt-4 flex gap-3">
              <button
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground"
                onClick={() => window.location.reload()}
              >
                Reîncarcă
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
