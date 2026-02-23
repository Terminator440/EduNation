/**
 * Teste RBAC: teacher nu accesează alte clase, student nu modifică date, parent vede doar copilul lui.
 * Unit tests pe permisiuni; RLS-ul efectiv este testat în integration tests.
 */
import { describe, it, expect } from "vitest";
import { getPermissionsForRoles, hasPermission } from "@/lib/permissions";

describe("RBAC: teacher, student, parent", () => {
  describe("teacher nu accesează alte clase", () => {
    it("teacher are grades:view_class și grades:edit dar NU grades:edit_any", () => {
      const perms = getPermissionsForRoles(["teacher"]);
      expect(perms.has("grades:view_class")).toBe(true);
      expect(perms.has("grades:edit")).toBe(true);
      expect(perms.has("grades:edit_any")).toBe(false);
    });

    it("teacher nu are school:manage (doar director/secretariat)", () => {
      expect(hasPermission(["teacher"], "school:manage")).toBe(false);
      expect(hasPermission(["teacher"], "classes:edit")).toBe(false);
    });

    it("teacher are students:view dar nu students:edit (doar diriginte)", () => {
      const perms = getPermissionsForRoles(["teacher"]);
      expect(perms.has("students:view")).toBe(true);
      expect(perms.has("students:edit")).toBe(false);
    });
  });

  describe("student nu modifică date", () => {
    it("student are doar grades:view_own și attendance:view_own", () => {
      const perms = getPermissionsForRoles(["student"]);
      expect(perms.has("grades:view_own")).toBe(true);
      expect(perms.has("attendance:view_own")).toBe(true);
      expect(perms.has("grades:edit")).toBe(false);
      expect(perms.has("attendance:edit")).toBe(false);
      expect(perms.has("grades:view_class")).toBe(false);
    });

    it("student nu are students:view, classes:view, reports:export", () => {
      expect(hasPermission(["student"], "students:view")).toBe(false);
      expect(hasPermission(["student"], "classes:view")).toBe(false);
      expect(hasPermission(["student"], "reports:export")).toBe(false);
    });
  });

  describe("parent vede doar copilul lui", () => {
    it("parent are aceleași permisiuni view ca student (view_own)", () => {
      const perms = getPermissionsForRoles(["parent"]);
      expect(perms.has("grades:view_own")).toBe(true);
      expect(perms.has("attendance:view_own")).toBe(true);
      expect(perms.has("grades:edit")).toBe(false);
      expect(perms.has("attendance:edit")).toBe(false);
    });

    it("parent nu are acces la clase sau elevi (filtrul copil e la nivel RLS)", () => {
      expect(hasPermission(["parent"], "students:view")).toBe(false);
      expect(hasPermission(["parent"], "classes:view")).toBe(false);
      expect(hasPermission(["parent"], "grades:view_class")).toBe(false);
    });
  });
});
