/**
 * Demo mode: credentials, detection, and protection from accidental deletion.
 */

export const DEMO_EMAILS = ["admin@demo.com", "teacher@demo.com", "parent@demo.com"] as const;
export const DEMO_PASSWORD = "Demo123!";

export type DemoRole = "Admin" | "Teacher" | "Parent";

const DEMO_CREDENTIALS: Record<DemoRole, { email: string; password: string }> = {
  Admin: { email: "admin@demo.com", password: DEMO_PASSWORD },
  Teacher: { email: "teacher@demo.com", password: DEMO_PASSWORD },
  Parent: { email: "parent@demo.com", password: DEMO_PASSWORD },
};

export function getDemoCredentials(role: DemoRole): { email: string; password: string } {
  return DEMO_CREDENTIALS[role];
}

export function isDemoUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return DEMO_EMAILS.some((e) => e.toLowerCase() === lower);
}

export function isDemoSchool(schoolName: string | null | undefined): boolean {
  if (!schoolName) return false;
  return /demo/i.test(schoolName.trim());
}

/** Call before delete operations; throws if target is demo and should be protected. */
export function preventDemoDeletion(
  kind: "user" | "school",
  identifier: { email?: string; schoolName?: string }
): void {
  if (kind === "user" && isDemoUser(identifier.email)) {
    throw new Error("Conturile demo nu pot fi șterse.");
  }
  if (kind === "school" && isDemoSchool(identifier.schoolName)) {
    throw new Error("Școala demo nu poate fi ștearsă.");
  }
}
