/**
 * RBAC – Role-based permissions for SaaS catalog.
 * Maps app_role to granular permissions. Server-side (RLS) is the source of truth;
 * this is for UI (hiding buttons, routes) and optional client-side guards.
 */
import type { AppRole } from "@/hooks/useAuth";

/** Granular permission keys. Server RLS enforces actual access. */
export type Permission =
  | "grades:view_own"
  | "grades:view_class"
  | "grades:edit"
  | "grades:edit_any"
  | "attendance:view_own"
  | "attendance:view_class"
  | "attendance:edit"
  | "classes:view"
  | "classes:edit"
  | "students:view"
  | "students:edit"
  | "reports:view"
  | "reports:export"
  | "audit:view"
  | "users:view"
  | "users:manage"
  | "school:manage"
  | "schools:list"
  | "invitations:create"
  | "invitations:revoke"
  | "announcements:create"
  | "notifications:view"
  | "settings:manage"
  | "system_health:view";

/** Maps each role to the set of permissions it has. */
const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  student: ["grades:view_own", "attendance:view_own", "notifications:view"],
  parent: ["grades:view_own", "attendance:view_own", "notifications:view"],
  teacher: [
    "grades:view_class",
    "grades:edit",
    "attendance:view_class",
    "attendance:edit",
    "classes:view",
    "students:view",
    "reports:view",
    "reports:export",
    "announcements:create",
    "notifications:view",
  ],
  homeroom_teacher: [
    "grades:view_class",
    "grades:edit",
    "attendance:view_class",
    "attendance:edit",
    "classes:view",
    "students:view",
    "students:edit",
    "reports:view",
    "reports:export",
    "invitations:create",
    "invitations:revoke",
    "announcements:create",
    "notifications:view",
  ],
  secretariat: [
    "grades:view_class",
    "grades:edit",
    "grades:edit_any",
    "attendance:view_class",
    "attendance:edit",
    "classes:view",
    "classes:edit",
    "students:view",
    "students:edit",
    "reports:view",
    "reports:export",
    "audit:view",
    "users:view",
    "users:manage",
    "invitations:create",
    "invitations:revoke",
    "announcements:create",
    "notifications:view",
    "settings:manage",
  ],
  director: [
    "grades:view_class",
    "grades:edit",
    "grades:edit_any",
    "attendance:view_class",
    "attendance:edit",
    "classes:view",
    "classes:edit",
    "students:view",
    "students:edit",
    "reports:view",
    "reports:export",
    "audit:view",
    "users:view",
    "users:manage",
    "school:manage",
    "invitations:create",
    "invitations:revoke",
    "announcements:create",
    "notifications:view",
    "settings:manage",
  ],
  uat_admin: [
    "grades:view_class",
    "grades:edit",
    "grades:edit_any",
    "attendance:view_class",
    "attendance:edit",
    "classes:view",
    "classes:edit",
    "students:view",
    "students:edit",
    "reports:view",
    "reports:export",
    "audit:view",
    "users:view",
    "users:manage",
    "school:manage",
    "schools:list",
    "invitations:create",
    "invitations:revoke",
    "announcements:create",
    "notifications:view",
    "settings:manage",
    "system_health:view",
  ],
  developer: [
    "grades:view_class",
    "grades:edit",
    "grades:edit_any",
    "attendance:view_class",
    "attendance:edit",
    "classes:view",
    "classes:edit",
    "students:view",
    "students:edit",
    "reports:view",
    "reports:export",
    "audit:view",
    "users:view",
    "users:manage",
    "school:manage",
    "schools:list",
    "invitations:create",
    "invitations:revoke",
    "announcements:create",
    "notifications:view",
    "settings:manage",
    "system_health:view",
  ],
};

/**
 * Returns the set of permissions for the given roles (e.g. active role + all assigned roles).
 */
export function getPermissionsForRoles(roles: AppRole[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (perms) perms.forEach((p) => set.add(p));
  }
  return set;
}

/**
 * Check if any of the given roles has the specified permission.
 */
export function hasPermission(roles: AppRole[], permission: Permission): boolean {
  return getPermissionsForRoles(roles).has(permission);
}
