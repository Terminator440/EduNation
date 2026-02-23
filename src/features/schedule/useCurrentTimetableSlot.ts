/**
 * Determină ora curentă din lista de intrări orar (timetable) pentru ziua curentă.
 * start_time / end_time sunt în format "HH:MM" sau "H:MM".
 */
export interface TimetableEntryForSlot {
  id: string;
  period: number;
  start_time: string | null;
  end_time: string | null;
  class_id: string | null;
  subject_id: string | null;
  classes?: { name: string } | null;
  subjects?: { name: string } | null;
}

function parseTime(s: string | null): number | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Returnează intrarea din orar care este „acum” (curent time între start_time și end_time).
 * Dacă nu e niciun interval activ, returnează null.
 */
export function getCurrentTimetableSlot(
  entries: TimetableEntryForSlot[]
): TimetableEntryForSlot | null {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const entry of entries) {
    const start = parseTime(entry.start_time);
    const end = parseTime(entry.end_time);
    if (start === null) continue;
    const endMinutes = end !== null ? end : start + 50; // default 50 min
    if (currentMinutes >= start && currentMinutes < endMinutes) return entry;
  }
  return null;
}
