/**
 * CSV export helper (client-side).
 * No magic behavior:
 * - headers are explicit
 * - row mapping is explicit by header keys
 * - values are stringified safely (quotes/commas/newlines supported)
 */
export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  headers: Array<keyof T & string>,
  rows: T[]
) {
  const escapeCell = (value: unknown) => {
    // Use JSON.stringify to safely quote and escape; fallback to empty string for null/undefined.
    return JSON.stringify(value ?? "");
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
