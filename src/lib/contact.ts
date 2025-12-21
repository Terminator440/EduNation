export type ParsedContact =
  | { kind: 'email'; email: string; phone: null }
  | { kind: 'phone'; email: null; phone: string }
  | { kind: 'empty'; email: null; phone: null };

/**
 * Parses a single input that may contain either an email address or a phone number.
 *
 * - Email: must contain '@' and pass a basic email pattern.
 * - Phone: accepts digits, spaces, dashes, parentheses; normalizes to E.164-ish where possible.
 *
 * This is a *best-effort* client-side normalization. The DB remains the source of truth.
 */
export function parseEmailOrPhone(raw: string): ParsedContact {
  const v = (raw ?? '').trim();
  if (!v) return { kind: 'empty', email: null, phone: null };

  if (v.includes('@')) {
    // Simple, pragmatic email check.
    const email = v.toLowerCase();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) throw new Error('contact_invalid_email');
    return { kind: 'email', email, phone: null };
  }

  // Normalize phone: keep + and digits.
  let cleaned = v.replace(/[\s\-()]/g, '');
  // Convert leading 00 to +
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  // Romanian common pattern: 07XXXXXXXX -> +407XXXXXXXX
  if (/^07\d{8}$/.test(cleaned)) cleaned = `+4${cleaned}`;

  // Basic phone sanity: + followed by 9-15 digits OR 9-15 digits.
  const digitsOnly = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  const ok = /^\d{9,15}$/.test(digitsOnly);
  if (!ok) throw new Error('contact_invalid_phone');

  const phone = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  return { kind: 'phone', email: null, phone };
}
