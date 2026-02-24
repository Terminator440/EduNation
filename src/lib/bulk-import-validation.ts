/**
 * Validation utilities for bulk import (students and teachers).
 * - Email format
 * - Romanian CNP (13 digits + checksum)
 * - CSV parsing and row validation (class resolution is done via service/RPC using school_id).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Romanian CNP control key for checksum (12 digits) */
const CNP_CONTROL_KEY = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && EMAIL_REGEX.test(trimmed);
}

/**
 * Validates Romanian CNP (Cod Numeric Personal):
 * - Exactly 13 digits
 * - Checksum (digit 13) matches control key algorithm
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

/** Optional CNP: empty/whitespace is valid (field not required); otherwise must be valid CNP */
export function validateCNPOptional(cnp: string): boolean {
  if (!cnp || typeof cnp !== "string" || cnp.trim() === "") return true;
  return validateCNP(cnp);
}

export type BulkImportRole = "student" | "teacher";

export type BulkImportRow = {
  email: string;
  full_name: string;
  cnp?: string;
  phone?: string;
  /** For students: class identifier (e.g. "10A" or class name). Resolved to class_id by backend or service. */
  class_identifier?: string;
};

export type BulkImportRowValidation = {
  rowIndex: number;
  email: string;
  full_name: string;
  cnp?: string;
  phone?: string;
  class_identifier?: string;
  class_id?: string;
  errors: string[];
  role: BulkImportRole;
};

/**
 * Validates a single row (client-side). Does not check class existence or duplicates.
 * Use RPC validate_bulk_import_rows for server-side class lookup and DB checks.
 */
export function validateBulkImportRow(
  row: BulkImportRow,
  rowIndex: number,
  role: BulkImportRole
): BulkImportRowValidation {
  const errors: string[] = [];
  const email = (row.email ?? "").trim();
  const full_name = (row.full_name ?? "").trim();
  const cnp = typeof row.cnp === "string" ? row.cnp.trim() : "";
  const phone = typeof row.phone === "string" ? row.phone.trim() : undefined;
  const class_identifier = typeof row.class_identifier === "string" ? row.class_identifier.trim() : undefined;

  if (!email) errors.push("Email lipsă");
  else if (!validateEmail(email)) errors.push("Email invalid");

  if (!full_name) errors.push("Nume complet lipsă");

  if (cnp && !validateCNP(cnp)) errors.push("CNP invalid (13 cifre + cifră de control)");

  if (role === "student" && !class_identifier) errors.push("Clasa este obligatorie pentru elevi");

  return {
    rowIndex,
    email,
    full_name,
    cnp: cnp || undefined,
    phone: phone || undefined,
    class_identifier: class_identifier || undefined,
    errors,
    role,
  };
}

/**
 * Parse CSV string into rows of key-value objects (first row = headers).
 * Handles quoted fields and simple commas.
 */
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).map((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "") continue;
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || (c === ";" && !inQuotes)) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/** Expected CSV headers (case-insensitive). Maps to BulkImportRow. */
export const BULK_IMPORT_CSV_HEADERS = {
  email: ["email", "e-mail", "mail"],
  full_name: ["full_name", "full name", "nume", "nume complet", "name"],
  cnp: ["cnp", "cod numeric personal"],
  phone: ["phone", "telefon", "tel"],
  class_identifier: ["class", "clasa", "class_identifier", "class_id"],
};

export function mapCSVRowToBulkImportRow(
  csvRow: Record<string, string>,
  role: BulkImportRole
): BulkImportRow {
  const get = (keys: string[]) => {
    const lower: Record<string, string> = {};
    Object.keys(csvRow).forEach((k) => {
      lower[k.trim().toLowerCase()] = csvRow[k];
    });
    for (const key of keys) {
      const val = lower[key.toLowerCase()];
      if (val !== undefined && val !== "") return val.trim();
    }
    return "";
  };
  return {
    email: get(BULK_IMPORT_CSV_HEADERS.email) || "",
    full_name: get(BULK_IMPORT_CSV_HEADERS.full_name) || "",
    cnp: get(BULK_IMPORT_CSV_HEADERS.cnp) || undefined,
    phone: get(BULK_IMPORT_CSV_HEADERS.phone) || undefined,
    class_identifier:
      role === "student" ? get(BULK_IMPORT_CSV_HEADERS.class_identifier) || undefined : undefined,
  };
}

/**
 * Build BulkImportRow from raw CSV row using explicit column mapping (field key -> CSV header).
 * Use when user has chosen which column maps to name, email, class.
 */
export function mapCSVRowWithMappingToBulkImportRow(
  csvRow: Record<string, string>,
  mapping: Record<string, string>,
  role: BulkImportRole
): BulkImportRow {
  const get = (fieldKey: string) => (mapping[fieldKey] ? (csvRow[mapping[fieldKey]] ?? "").trim() : "");
  return {
    email: get("email") || "",
    full_name: get("name") || "",
    cnp: get("cnp") || undefined,
    phone: get("phone") || undefined,
    class_identifier: role === "student" ? get("class") || undefined : undefined,
  };
}
