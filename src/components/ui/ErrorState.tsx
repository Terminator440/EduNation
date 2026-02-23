/**
 * Error state – afișat când încărcarea datelor a eșuat.
 * UX: mesaj de eroare și opțiune de reîncercare.
 */
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
};

export function ErrorState({
  title = "Ceva nu a mers bine",
  message = "Nu am putut încărca datele. Încercați din nou.",
  onRetry,
  className,
  children,
}: Props) {
  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center",
        className
      )}
      role="alert"
    >
      <AlertCircle className="h-10 w-10 text-destructive mb-4" aria-hidden />
      <h3 className="text-lg font-medium text-destructive">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {children}
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={handleRetry}>
          Încercă din nou
        </Button>
      )}
    </div>
  );
}
