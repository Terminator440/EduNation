/**
 * Unit tests for RBAC permissions mapping.
 */
import { describe, it, expect } from "vitest";
import {
  getPermissionsForRoles,
  hasPermission,
  type Permission,
} from "./permissions";

describe("permissions", () => {
  describe("getPermissionsForRoles", () => {
    it("student has grades:view_own and attendance:view_own", () => {
      const perms = getPermissionsForRoles(["student"]);
      expect(perms.has("grades:view_own")).toBe(true);
      expect(perms.has("attendance:view_own")).toBe(true);
      expect(perms.has("grades:edit")).toBe(false);
    });

    it("teacher has grades:edit and grades:view_class", () => {
      const perms = getPermissionsForRoles(["teacher"]);
      expect(perms.has("grades:edit")).toBe(true);
      expect(perms.has("grades:view_class")).toBe(true);
      expect(perms.has("grades:edit_any")).toBe(false);
    });

    it("director has school:manage and audit:view", () => {
      const perms = getPermissionsForRoles(["director"]);
      expect(perms.has("school:manage")).toBe(true);
      expect(perms.has("audit:view")).toBe(true);
    });

    it("uat_admin has schools:list and system_health:view", () => {
      const perms = getPermissionsForRoles(["uat_admin"]);
      expect(perms.has("schools:list")).toBe(true);
      expect(perms.has("system_health:view")).toBe(true);
    });

    it("multiple roles merge permissions", () => {
      const perms = getPermissionsForRoles(["teacher", "homeroom_teacher"]);
      expect(perms.has("grades:edit")).toBe(true);
      expect(perms.has("students:edit")).toBe(true);
    });
  });

  describe("hasPermission", () => {
    it("returns true when role has permission", () => {
      expect(hasPermission(["director"], "audit:view")).toBe(true);
      expect(hasPermission(["student"], "grades:view_own")).toBe(true);
    });

    it("returns false when role lacks permission", () => {
      expect(hasPermission(["student"], "grades:edit")).toBe(false);
      expect(hasPermission(["parent"], "school:manage")).toBe(false);
    });

    it("returns true if any role has permission", () => {
      expect(hasPermission(["student", "teacher"], "grades:edit")).toBe(true);
    });
  });
});
