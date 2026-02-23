/**
 * usePermissions – RBAC hook for UI and route guards.
 * Uses current user's roles (from useAuth) to expose can(permission) and role checks.
 * Server-side RLS remains the source of truth for data access.
 */
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  type Permission,
  getPermissionsForRoles,
  hasPermission as checkPermission,
} from "@/lib/permissions";

export type { Permission } from "@/lib/permissions";

export function usePermissions() {
  const { userRoles, activeRole } = useAuth();

  const roles = useMemo(() => {
    const r = activeRole ? [activeRole, ...userRoles] : [...userRoles];
    return [...new Set(r)] as typeof userRoles;
  }, [activeRole, userRoles]);

  const permissions = useMemo(() => getPermissionsForRoles(roles), [roles]);

  const can = (permission: Permission): boolean => permissions.has(permission);

  const hasAnyRole = (allowedRoles: string[]): boolean =>
    roles.some((r) => allowedRoles.includes(r));

  const hasAllRoles = (requiredRoles: string[]): boolean =>
    requiredRoles.every((r) => roles.includes(r as typeof roles[number]));

  return {
    permissions,
    can,
    hasAnyRole,
    hasAllRoles,
    roles,
    activeRole,
  };
}

/**
 * Hook for route/component guard: requires permission or redirects / shows fallback.
 * Use with ProtectedRoute or conditional render.
 */
export function useRequirePermission(permission: Permission): boolean {
  const { can } = usePermissions();
  return can(permission);
}
