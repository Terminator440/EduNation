import * as React from "react";
import { lazy, Suspense } from "react";
import type { CalendarProps } from "./CalendarImpl";

const CalendarImpl = lazy(() => import("./CalendarImpl").then((m) => ({ default: m.CalendarImpl })));

const CalendarFallback = () => (
  <div className="p-3 h-[280px] animate-pulse bg-muted/30 rounded-md flex items-center justify-center text-muted-foreground text-sm">
    Se încarcă…
  </div>
);

function Calendar(props: CalendarProps) {
  return (
    <Suspense fallback={<CalendarFallback />}>
      <CalendarImpl {...props} />
    </Suspense>
  );
}
Calendar.displayName = "Calendar";

export type { CalendarProps };
export { Calendar };
