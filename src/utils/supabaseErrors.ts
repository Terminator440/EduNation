// Friendly error messages for Supabase/PostgREST.
// Goal: improve UX for RLS (Row Level Security) and permission errors.

type AnyError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: number;
  statusCode?: number;
} & Record<string, any>;

export function toFriendlySupabaseError(err: unknown): string {
  const e = (err as AnyError) ?? {};
  const message = (e.message || "").toLowerCase();
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : undefined;

  // Permission / RLS
  if (status === 401) {
    return "Sesiunea ta a expirat. Autentifică-te din nou.";
  }
  if (status === 403 || message.includes("permission") || message.includes("rls") || message.includes("row level security")) {
    return "Nu ai permisiunea necesară pentru această acțiune.";
  }

  // Common Postgres constraint patterns
  if (message.includes("duplicate key") || message.includes("unique")) {
    return "Există deja o înregistrare similară.";
  }
  if (message.includes("violates foreign key") || message.includes("foreign key")) {
    return "Datele sunt legate de alte înregistrări și nu pot fi modificate astfel.";
  }


  // Missing table / schema cache (PostgREST)
  if (message.includes("schema cache") || message.includes("could not find the table")) {
    return "Tabelele necesare nu există încă în baza de date (sau schema cache nu e actualizată). Rulează migrațiile Supabase și reîncearcă.";
  }

  // Missing column
  if (message.includes("does not exist") && message.includes("column")) {
    return "Schema bazei de date nu este actualizată (lipsește o coloană). Rulează migrațiile Supabase (ex: contact_email/contact_phone) și reîncearcă.";
  }

  // Fallback
  const raw = (e.message || e.details || "").trim();
  return raw ? raw : "A apărut o eroare neașteptată.";
}
