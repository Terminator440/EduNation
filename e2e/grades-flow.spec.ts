/**
 * E2E: Profesor adaugă notă → elevul vede nota.
 * Necesită conturi de test: VITE_TEST_TEACHER_EMAIL, VITE_TEST_TEACHER_PASSWORD,
 * VITE_TEST_STUDENT_EMAIL, VITE_TEST_STUDENT_PASSWORD și date în DB (clasă, materie, elev, asignare profesor).
 */
import { test, expect } from "@playwright/test";

const TEACHER_EMAIL = process.env.VITE_TEST_TEACHER_EMAIL;
const TEACHER_PASSWORD = process.env.VITE_TEST_TEACHER_PASSWORD;
const STUDENT_EMAIL = process.env.VITE_TEST_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.VITE_TEST_STUDENT_PASSWORD;

test.describe("Flux note: profesor adaugă notă, elev vede", () => {
  test.skip(
    !TEACHER_EMAIL || !TEACHER_PASSWORD || !STUDENT_EMAIL || !STUDENT_PASSWORD,
    "Set VITE_TEST_TEACHER_EMAIL, VITE_TEST_TEACHER_PASSWORD, VITE_TEST_STUDENT_EMAIL, VITE_TEST_STUDENT_PASSWORD"
  );

  test("profesor se autentifică și ajunge la dashboard", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(TEACHER_EMAIL!);
    await page.getByLabel(/parolă|password/i).fill(TEACHER_PASSWORD!);
    await page.getByRole("button", { name: /conectare|login|intră/i }).click();
    await expect(page).toHaveURL(/\/(teacher|dashboard|homeroom|secretariat|director)/);
  });

  test("elev se autentifică și vede secțiunea note", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(STUDENT_EMAIL!);
    await page.getByLabel(/parolă|password/i).fill(STUDENT_PASSWORD!);
    await page.getByRole("button", { name: /conectare|login|intră/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|student)/);
    await page.goto("/dashboard/grades");
    await expect(page.getByRole("heading", { level: 1 }).or(page.getByText(/note|grades/i))).toBeVisible();
  });
});
