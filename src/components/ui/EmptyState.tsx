/**
 * Empty state – afișat când nu există date de listat.
 * UX: mesaj clar și opțional acțiune (ex: "Adaugă primul elev").
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
};

export function EmptyState({
  title,
  description,
  action,
  className,
  icon,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center",
        className
      )}
      role="status"
      aria-label={title}
    >
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-medium">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
