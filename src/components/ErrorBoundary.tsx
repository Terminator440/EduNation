import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
  errorId?: string;
};

// ErrorInfo is provided by React.ErrorInfo type

/**
 * ErrorBoundary îmbunătățit cu logging și UI prietenos.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log to console
    console.error("[ErrorBoundary] Unhandled app error:", {
      error,
      errorInfo,
      timestamp: new Date().toISOString(),
    });

    // Try to log to backend (fire and forget)
    this.logErrorToBackend({
      message: errorMessage,
      stack: errorStack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  }

  private async logErrorToBackend(details: {
    message: string;
    stack?: string;
    componentStack: string;
    url: string;
    userAgent: string;
  }) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (user) {
        // Log error via audit log function
        const { data: logId } = await supabase.rpc("log_audit", {
          _user_id: user.id,
          _user_name: user.email || "Unknown",
          _active_role: "student" as Database["public"]["Enums"]["app_role"],
          _action: "error.frontend",
          _entity_type: "app_error",
          _entity_id: null,
          _details: {
            message: details.message,
            url: details.url,
            userAgent: details.userAgent,
            // Don't include full stack in details to keep it clean
            hasStack: !!details.stack,
          },
        });

        if (logId) {
          this.setState((prev) => ({ ...prev, errorId: logId }));
        }
      }
    } catch (logError) {
      // Silently fail - don't compound the error
      console.warn("[ErrorBoundary] Failed to log error to backend:", logError);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-lg w-full rounded-2xl border border-border bg-card p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  A apărut o eroare
                </h1>
                <p className="text-sm text-muted-foreground">
                  Aplicația a întâmpinat o problemă neașteptată.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 mb-6">
              <p className="text-sm font-mono text-muted-foreground break-words">
                {this.state.message}
              </p>
              {this.state.errorId && (
                <p className="text-xs text-muted-foreground mt-2">
                  ID eroare: <code>{this.state.errorId}</code>
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Reîncarcă pagina
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
                <Home className="w-4 h-4" />
                Pagina principală
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-6 text-center">
              Dacă problema persistă, contactează administratorul.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
