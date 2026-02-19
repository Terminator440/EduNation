import { useRef, useEffect, useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface QuickGradeStudent {
  id: string;
  full_name: string | null;
  profile?: { full_name: string | null } | null;
}

interface QuickGradeProps {
  students: QuickGradeStudent[];
  subjectId: string;
  subjectName: string;
  date: string;
  onGradeEntered: (studentId: string, grade: number) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

/**
 * Bulk grade entry: one input per student. Navigate with ArrowUp/ArrowDown, submit with Enter.
 * Mobile-friendly: large touch targets, responsive grid.
 */
export function QuickGrade({
  students,
  subjectId,
  subjectName,
  date,
  onGradeEntered,
  disabled = false,
  className,
}: QuickGradeProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const displayName = (s: QuickGradeStudent) =>
    s.full_name || s.profile?.full_name || "Elev";

  const submitGrade = useCallback(
    async (studentId: string, raw: string) => {
      const v = Math.round(parseFloat(raw));
      if (Number.isNaN(v) || v < 1 || v > 10) return;
      setPending(studentId);
      try {
        await onGradeEntered(studentId, v);
        setValues((prev) => ({ ...prev, [studentId]: "" }));
        const idx = students.findIndex((x) => x.id === studentId);
        if (idx >= 0 && idx < students.length - 1) {
          setFocusedIndex(idx + 1);
          setTimeout(() => inputRefs.current[idx + 1]?.focus(), 0);
        }
      } finally {
        setPending(null);
      }
    },
    [onGradeEntered, students]
  );

  useEffect(() => {
    inputRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    studentId: string,
    index: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = values[studentId] ?? "";
      if (raw.trim()) submitGrade(studentId, raw.trim());
      else if (index < students.length - 1) {
        setFocusedIndex(index + 1);
        setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
      }
      return;
    }
    if (e.key === "ArrowDown" && index < students.length - 1) {
      e.preventDefault();
      setFocusedIndex(index + 1);
      setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
    }
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      setFocusedIndex(index - 1);
      setTimeout(() => inputRefs.current[index - 1]?.focus(), 0);
    }
  };

  if (!subjectId || students.length === 0) {
    return (
      <div className={cn("text-muted-foreground text-sm p-4", className)}>
        Selectează o clasă și o materie pentru a introduce note rapid.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
        <Label className="text-sm font-medium">
          {subjectName} – {date}
        </Label>
        <span className="text-xs text-muted-foreground">
          Săgeți sus/jos • Enter = salvează și treci la următorul
        </span>
      </div>
      <div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-1">
        {students.map((student, index) => (
          <div
            key={student.id}
            className={cn(
              "grid grid-cols-[1fr,4rem] sm:grid-cols-[1fr,5rem] gap-2 items-center",
              pending === student.id && "opacity-70"
            )}
          >
            <Label
              htmlFor={`quick-grade-${student.id}`}
              className="text-sm truncate"
            >
              {displayName(student)}
            </Label>
            <Input
              id={`quick-grade-${student.id}`}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="number"
              min={1}
              max={10}
              step={1}
              inputMode="numeric"
              autoComplete="off"
              placeholder="–"
              value={values[student.id] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [student.id]: e.target.value,
                }))
              }
              onKeyDown={(e) => handleKeyDown(e, student.id, index)}
              onBlur={() => {
                const raw = values[student.id] ?? "";
                if (raw.trim()) submitGrade(student.id, raw.trim());
              }}
              disabled={disabled || pending !== null}
              className="text-center text-base h-10 sm:h-11"
              aria-label={`Notă ${displayName(student)}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
