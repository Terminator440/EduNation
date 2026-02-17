import { memo } from "react";
import { cn } from "@/lib/utils";

/** Spinner simplu (SVG minimal) cu will-change: transform – randare pe GPU. Memoizat pentru a evita re-render-uri inutile. */
const Spinner = memo(function Spinner({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm" ? "h-6 w-6" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const strokeWidth = size === "sm" ? 2 : 2;

  return (
    <svg
      className={cn(
        "animate-spin will-change-transform",
        sizeClass,
        className
      )}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray="47 63"
        strokeLinecap="round"
      />
    </svg>
  );
});

export { Spinner };
