/**
 * Middleware component: require permission to render children.
 * Use for hiding UI or wrapping protected sections (e.g. "Edit grade" button).
 * For routes, continue using ProtectedRoute with allowedRoles.
 */
import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { Permission } from "@/lib/permissions";

type Props = {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Renders children only if the current user has the given permission; otherwise renders fallback (or null).
 */
export function RequirePermission({ permission, children, fallback = null }: Props) {
  const { can } = usePermissions();
  if (can(permission)) return <>{children}</>;
  return <>{fallback}</>;
}
