/**
 * Romanian CNP (Cod Numeric Personal) validation and parsing.
 * Used in student registration forms to validate CNP and extract birth date and gender.
 * @see https://ro.wikipedia.org/wiki/Cod_numeric_personal
 */

const CNP_CONTROL_KEY = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];

/**
 * Validates Romanian CNP: 13 digits and correct checksum.
 */
export function validateCNP(cnp: string): boolean {
  if (!cnp || typeof cnp !== "string") return false;
  const digits = cnp.trim().replace(/\s/g, "");
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i], 10) * CNP_CONTROL_KEY[i];
  }
  const remainder = sum % 11;
  const expectedControl = remainder === 10 ? 1 : remainder;
  return expectedControl === parseInt(digits[12], 10);
}

export type CNPParseResult = {
  /** Normalized 13-digit string */
  cnp: string;
  /** Birth date from positions 2-7 (S YY MM DD) */
  birthDate: Date;
  /** M or F from first digit (odd = M, even = F for 1-6; 7,9 = M, 8 = F) */
  gender: "M" | "F";
};

/**
 * Parses a valid CNP and returns birth date and gender.
 * Returns null if the CNP is invalid (call validateCNP first).
 */
export function parseCNP(cnp: string): CNPParseResult | null {
  if (!validateCNP(cnp)) return null;
  const digits = cnp.trim().replace(/\s/g, "");
  const s = parseInt(digits[0], 10);
  const yy = parseInt(digits.slice(1, 3), 10);
  const mm = parseInt(digits.slice(3, 5), 10);
  const dd = parseInt(digits.slice(5, 7), 10);

  let fullYear: number;
  if (s === 1 || s === 2 || s === 9) fullYear = 1900 + yy;
  else if (s === 3 || s === 4) fullYear = 1800 + yy;
  else fullYear = 2000 + yy;

  const birthDate = new Date(fullYear, mm - 1, dd);
  if (Number.isNaN(birthDate.getTime()) || birthDate.getDate() !== dd || birthDate.getMonth() !== mm - 1) {
    return null;
  }

  const gender: "M" | "F" = s % 2 === 1 ? "M" : "F";
  return { cnp: digits, birthDate, gender };
}

/**
 * Format CNP for display (e.g. "1 90 01 01 12 34 5" or keep as 13 digits).
 */
export function formatCNPDisplay(cnp: string): string {
  const d = cnp.trim().replace(/\s/g, "");
  if (d.length !== 13) return cnp;
  return `${d.slice(0, 1)} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)} ${d.slice(9, 12)} ${d.slice(12)}`;
}

/** Format date as DD.MM.YYYY for display in forms */
export function formatBirthDateRO(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}
