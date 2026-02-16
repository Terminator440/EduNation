const EN_PREFIX = "EN-";
const PAD_LENGTH = 5;

/**
 * Cleans user input (digits only or "EN-" prefix) and returns standard format EN-XXXXX (5 digits).
 * Examples: "123" -> "EN-00123", "EN-123" -> "EN-00123", "EN-00123" -> "EN-00123".
 */
export function formatStudentNumber(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/^EN-/, "");
  const digits = cleaned.replace(/\D/g, "").slice(0, PAD_LENGTH);
  const num = digits === "" ? 0 : parseInt(digits, 10);
  const padded = num.toString().padStart(PAD_LENGTH, "0");
  return `${EN_PREFIX}${padded}`;
}

/**
 * Returns true if the input has at least one digit (so we can format it).
 */
export function hasStudentNumberInput(input: string): boolean {
  return /\d/.test(input.trim().replace(/^EN-/i, ""));
}

/**
 * Parses the numeric part from a stored value (EN-00123 -> 123).
 * Handles legacy integer from DB for backward compatibility.
 */
export function parseStudentNumberNumeric(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const match = value.trim().toUpperCase().match(/^EN-0*([1-9]\d*|0)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Valid format for display/validation: EN- followed by 5 digits.
 */
export function isValidStudentNumberFormat(value: string): boolean {
  return /^EN-\d{5}$/.test(value.trim().toUpperCase());
}

/**
 * Given existing student_number values (from DB), returns the next available EN-XXXXX.
 * Values can be string (EN-00123) or legacy number.
 */
export function getNextStudentNumber(existing: (string | number | null)[]): string {
  const numbers = existing
    .map(parseStudentNumberNumeric)
    .filter((n): n is number => n != null && n >= 0);
  const max = numbers.length ? Math.max(...numbers) : 0;
  const next = max + 1;
  const padded = next.toString().padStart(PAD_LENGTH, "0");
  return `${EN_PREFIX}${padded}`;
}
