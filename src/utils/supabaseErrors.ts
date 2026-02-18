/**
 * Mesaje de eroare prietenoase pentru Supabase/PostgREST.
 * Înlocuiește mesajele tehnice (ex: "Database error 403") cu text înțeles de utilizator.
 */

type AnyError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: number;
  statusCode?: number;
} & Record<string, unknown>;

export type FriendlyErrorContext = {
  entity?: "grade" | "attendance" | "invitation" | "assignment" | "import" | "school" | "student";
  action?: "add" | "update" | "delete" | "create" | "fetch";
};

export function toFriendlySupabaseError(err: unknown, context?: FriendlyErrorContext): string {
  const e = (err as AnyError) ?? {};
  const message = (e.message || "").toLowerCase();
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : undefined;

  // Permission / RLS
  if (status === 401) {
    return "Sesiunea ta a expirat. Autentifică-te din nou.";
  }
  if (status === 403 || message.includes("permission") || message.includes("rls") || message.includes("row level security")) {
    if (context?.entity === "grade") {
      if (context.action === "add") return "Nu aveți permisiunea de a adăuga note.";
      if (context.action === "update") return "Nu aveți permisiunea de a modifica această notă.";
      if (context.action === "delete") return "Nu aveți permisiunea de a șterge această notă.";
    }
    if (context?.entity === "attendance") {
      if (context.action === "add") return "Nu aveți permisiunea de a înregistra absențe.";
      if (context.action === "update") return "Nu aveți permisiunea de a modifica această absență.";
      if (context.action === "delete") return "Nu aveți permisiunea de a șterge această absență.";
    }
    if (context?.entity === "invitation") return "Nu aveți permisiunea de a gestiona invitațiile.";
    if (context?.entity === "assignment") return "Nu aveți permisiunea de a realiza asignări.";
    if (context?.entity === "school") return "Nu aveți permisiunea de a modifica datele școlii.";
    if (context?.entity === "import") return "Nu aveți permisiunea de a importa utilizatori.";
    if (context?.entity === "student" && context?.action === "add") return "Nu aveți permisiunea de a adăuga elevi în clasă.";
    return "Nu aveți permisiunea necesară pentru această acțiune.";
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
