/**
 * Integration tests for critical security scenarios (RLS on grades).
 *
 * Prerequisites:
 * - VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (e.g. from .env or .env.test).
 * - Optional: VITE_TEST_STUDENT_EMAIL, VITE_TEST_STUDENT_PASSWORD (elev care are cel puțin o notă).
 * - Optional: VITE_TEST_TEACHER_EMAIL, VITE_TEST_TEACHER_PASSWORD (profesor).
 * - Optional: VITE_TEST_PARENT_EMAIL, VITE_TEST_PARENT_PASSWORD (părinte legat de un copil; pentru testul 3 e nevoie și de teacher pentru a obține id-ul unui alt elev).
 * - Optional: VITE_TEST_TEACHER_SCHOOL_B_EMAIL, VITE_TEST_TEACHER_SCHOOL_B_PASSWORD (profesor de la Școala B / Liceul Cucu pentru testul Cross-School Access).
 * - Optional: VITE_TEST_DIRECTOR_EMAIL, VITE_TEST_DIRECTOR_PASSWORD (director/secretariat pentru setup/cleanup la testul Semestru Închis).
 *
 * Rulează: npm run test -- --run src/test/integration/grades-security.integration.test.ts
 *
 * Orice test care trece în loc să fie blocat de securitate este raportat la final.
 */

import { describe, it, expect } from "vitest";
import {
  createTestSupabaseClient,
  isIntegrationTestEnvConfigured,
  hasStudentCredentials,
  hasTeacherCredentials,
  hasParentCredentials,
  hasTeacherSchoolBCredentials,
  hasDirectorCredentials,
  getTestUserEnv,
} from "./security-helpers";

const shouldRun = isIntegrationTestEnvConfigured();

/** Collect tests that passed but should have been blocked (security failure). */
const securityFailures: string[] = [];

describe.skipIf(!shouldRun)("Grades security (integration)", () => {
  describe("1. Student cannot modify a grade via API", () => {
    it("should fail when student tries to update a grade", async () => {
      if (!hasStudentCredentials()) {
        return; // skip silently when no credentials
      }
      const supabase = createTestSupabaseClient();
      const { studentEmail, studentPassword } = getTestUserEnv();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: studentEmail!,
        password: studentPassword!,
      });
      expect(authError).toBeNull();
      expect(authData.user).toBeDefined();

      // Student can only see their own grades; get one grade id
      const { data: myGrades, error: selectError } = await supabase
        .from("grades")
        .select("id")
        .is("deleted_at", null)
        .limit(1);
      if (selectError || !myGrades?.length) {
        // Student has no grades in test DB – cannot test update; skip
        await supabase.auth.signOut();
        return;
      }
      const gradeId = myGrades[0].id;

      // Attempt to modify the grade (should be blocked by RLS)
      const { data: updateData, error: updateError } = await supabase
        .from("grades")
        .update({ grade: 10 })
        .eq("id", gradeId)
        .select("id")
        .maybeSingle();

      await supabase.auth.signOut();

      // RLS: students have no UPDATE policy on grades → expect error or no row updated
      const blocked = Boolean(updateError) || updateData === null;
      if (!blocked) {
        securityFailures.push(
          "SECURITY: Un elev a putut modifica o notă prin API (ar fi trebuit blocat de RLS)."
        );
      }
      expect(blocked).toBe(true);
      expect(updateData).toBeNull();
    }, 15_000);
  });

  describe("2. Teacher cannot add a grade in a closed semester", () => {
    it("should fail when teacher inserts a grade for a date in a locked semester", async () => {
      if (!hasTeacherCredentials()) {
        return;
      }
      const supabase = createTestSupabaseClient();
      const { teacherEmail, teacherPassword, directorEmail, directorPassword } = getTestUserEnv();

      const academicYear = 2022;
      const semesterNum = 1;
      const closedSemesterDate = "2022-09-15";

      // ---- Get school_id and current semester state (as teacher) ----
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: teacherEmail!,
        password: teacherPassword!,
      });
      expect(authError).toBeNull();

      const { data: students } = await supabase
        .from("students")
        .select("id, school_id")
        .limit(1);
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id")
        .limit(1);
      if (!students?.length || !subjects?.length) {
        await supabase.auth.signOut();
        return;
      }
      const studentId = students[0].id;
      const schoolId = students[0].school_id;
      const subjectId = subjects[0].id;

      const { data: existingSemester } = await supabase
        .from("semesters")
        .select("id, is_locked")
        .eq("school_id", schoolId)
        .eq("academic_year", academicYear)
        .eq("semester", semesterNum)
        .maybeSingle();

      await supabase.auth.signOut();

      // ---- Setup: ensure a locked semester exists for testing ----
      let cleanupSemesterId: string | null = null; // id of row we inserted (to delete on cleanup)
      let restoreLocked = false; // if we toggled an existing row to true, restore to false

      if (existingSemester?.is_locked === true) {
        // Already locked, nothing to do
      } else if (hasDirectorCredentials() && directorEmail && directorPassword) {
        const { error: directorAuth } = await supabase.auth.signInWithPassword({
          email: directorEmail,
          password: directorPassword,
        });
        if (directorAuth) {
          // eslint-disable-next-line no-console
          console.warn(
            "[Semestru Închis] Setup eșuat: autentificare director nereușită. Verifică VITE_TEST_DIRECTOR_EMAIL / VITE_TEST_DIRECTOR_PASSWORD."
          );
        } else {
          if (existingSemester) {
            const { error: updateErr } = await supabase
              .from("semesters")
              .update({ is_locked: true })
              .eq("id", existingSemester.id);
            if (updateErr) {
              // eslint-disable-next-line no-console
              console.warn("[Semestru Închis] Setup eșuat: nu s-a putut seta is_locked (director):", updateErr.message);
            } else {
              restoreLocked = true; // was false, we set to true → cleanup: set back to false
            }
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from("semesters")
              .insert({
                school_id: schoolId,
                academic_year: academicYear,
                semester: semesterNum,
                is_locked: true,
              })
              .select("id")
              .single();
            if (insertErr) {
              // eslint-disable-next-line no-console
              console.warn("[Semestru Închis] Setup eșuat: nu s-a putut crea semestrul (director):", insertErr.message);
            } else if (inserted?.id) {
              cleanupSemesterId = inserted.id;
            }
          }
          await supabase.auth.signOut();
        }
      } else {
        // No director credentials: try as teacher (will fail due to RLS)
        const { error: teacherAuth2 } = await supabase.auth.signInWithPassword({
          email: teacherEmail!,
          password: teacherPassword!,
        });
        if (!teacherAuth2 && existingSemester) {
          const { error: updateErr } = await supabase
            .from("semesters")
            .update({ is_locked: true })
            .eq("id", existingSemester.id);
          await supabase.auth.signOut();
          if (updateErr) {
            // eslint-disable-next-line no-console
            console.warn(
              "[Semestru Închis] Setup eșuat din cauza permisiunilor: doar director/secretariat pot modifica semestre. " +
                "Pentru setup automat, configurează VITE_TEST_DIRECTOR_EMAIL și VITE_TEST_DIRECTOR_PASSWORD."
            );
          }
        } else {
          await supabase.auth.signOut();
        }
      }

      // ---- Re-check if semester is locked (after possible setup) ----
      const { error: signIn2 } = await supabase.auth.signInWithPassword({
        email: teacherEmail!,
        password: teacherPassword!,
      });
      if (signIn2) return;

      const { data: semestersAfter } = await supabase
        .from("semesters")
        .select("is_locked")
        .eq("school_id", schoolId)
        .eq("academic_year", academicYear)
        .eq("semester", semesterNum)
        .maybeSingle();

      const semesterIsLocked = semestersAfter?.is_locked === true;

      // ---- Run test: teacher tries to insert grade for date in (possibly) locked semester ----
      const { data: insertData, error: insertError } = await supabase
        .from("grades")
        .insert({
          student_id: studentId,
          subject_id: subjectId,
          grade: 7,
          date: closedSemesterDate,
        })
        .select("id")
        .maybeSingle();

      // ---- Cleanup: restore semester state ----
      if (restoreLocked && existingSemester && hasDirectorCredentials() && directorEmail && directorPassword) {
        await supabase.auth.signOut();
        const { error: directorAuth2 } = await supabase.auth.signInWithPassword({
          email: directorEmail,
          password: directorPassword,
        });
        if (!directorAuth2) {
          await supabase.from("semesters").update({ is_locked: false }).eq("id", existingSemester.id);
          await supabase.auth.signOut();
        }
      } else if (cleanupSemesterId && hasDirectorCredentials() && directorEmail && directorPassword) {
        await supabase.auth.signOut();
        const { error: directorAuth2 } = await supabase.auth.signInWithPassword({
          email: directorEmail,
          password: directorPassword,
        });
        if (!directorAuth2) {
          await supabase.from("semesters").delete().eq("id", cleanupSemesterId);
          await supabase.auth.signOut();
        }
      } else {
        await supabase.auth.signOut();
      }

      const blocked = Boolean(insertError) || insertData === null;
      if (semesterIsLocked && !blocked) {
        securityFailures.push(
          "SECURITY: Un profesor a putut adăuga o notă într-un semestru închis (RLS ar fi trebuit să blocheze)."
        );
      }
      if (semesterIsLocked) {
        expect(blocked).toBe(true);
        expect(insertData).toBeNull();
      }
    }, 20_000);
  });

  describe("3. Parent cannot see another child's grades", () => {
    it("should return no rows when parent queries grades for a student not linked to them", async () => {
      if (!hasParentCredentials() || !hasTeacherCredentials()) {
        return;
      }
      const supabase = createTestSupabaseClient();
      const { parentEmail, parentPassword, teacherEmail, teacherPassword } = getTestUserEnv();

      // As teacher, get a student_id (any student in school)
      const { error: teacherAuth } = await supabase.auth.signInWithPassword({
        email: teacherEmail!,
        password: teacherPassword!,
      });
      if (teacherAuth) return;
      const { data: teacherStudents } = await supabase
        .from("students")
        .select("id")
        .limit(5);
      await supabase.auth.signOut();
      if (!teacherStudents?.length) return;

      const someStudentIds = teacherStudents.map((s) => s.id);

      // As parent, get my linked children (student_ids I can see)
      const { error: parentAuth } = await supabase.auth.signInWithPassword({
        email: parentEmail!,
        password: parentPassword!,
      });
      if (parentAuth) return;

      const { data: myGrades } = await supabase
        .from("grades")
        .select("student_id")
        .is("deleted_at", null);
      const myChildIds = new Set((myGrades ?? []).map((r) => r.student_id));

      // Pick a student that is not my child
      const otherStudentId = someStudentIds.find((id) => !myChildIds.has(id));
      if (!otherStudentId) {
        await supabase.auth.signOut();
        return; // all teacher students are my children in test data
      }

      // Query grades for that other student as parent – should get 0 rows (RLS)
      const { data: otherGrades, error: otherError } = await supabase
        .from("grades")
        .select("id, grade, student_id")
        .eq("student_id", otherStudentId)
        .is("deleted_at", null);

      await supabase.auth.signOut();

      const blocked = !otherError && Array.isArray(otherGrades) && otherGrades.length === 0;
      if (!blocked && otherGrades && otherGrades.length > 0) {
        securityFailures.push(
          "SECURITY: Un părinte a putut vedea notele unui elev care nu este copilul lui (RLS ar fi trebuit să returneze 0 rânduri)."
        );
      }
      expect(otherError).toBeNull();
      expect(Array.isArray(otherGrades)).toBe(true);
      expect((otherGrades ?? []).length).toBe(0);
    }, 15_000);
  });

  describe("4. Cross-School Access", () => {
    it("should return no rows when teacher from School A tries to read grades of a student from School B (Liceul Cucu)", async () => {
      if (!hasTeacherCredentials() || !hasTeacherSchoolBCredentials()) {
        return;
      }
      const supabase = createTestSupabaseClient();
      const { teacherEmail, teacherPassword, teacherSchoolBEmail, teacherSchoolBPassword } = getTestUserEnv();

      // Sign in as teacher from School B (Liceul Cucu), get one student_id from their school
      const { error: authBError } = await supabase.auth.signInWithPassword({
        email: teacherSchoolBEmail!,
        password: teacherSchoolBPassword!,
      });
      if (authBError) return;

      const { data: studentsSchoolB } = await supabase
        .from("students")
        .select("id")
        .limit(1);
      await supabase.auth.signOut();

      if (!studentsSchoolB?.length) {
        return; // Școala B nu are elevi în test DB
      }
      const studentIdSchoolB = studentsSchoolB[0].id;

      // Sign in as teacher from School A and try to SELECT grades for the student from School B
      const { error: authAError } = await supabase.auth.signInWithPassword({
        email: teacherEmail!,
        password: teacherPassword!,
      });
      if (authAError) return;

      const { data: gradesCrossSchool, error: selectError } = await supabase
        .from("grades")
        .select("id, grade, student_id")
        .eq("student_id", studentIdSchoolB)
        .is("deleted_at", null);

      await supabase.auth.signOut();

      // RLS: teacher sees only grades from their school; student is from School B → 0 rows
      const blocked = !selectError && Array.isArray(gradesCrossSchool) && gradesCrossSchool.length === 0;
      if (!blocked && gradesCrossSchool && gradesCrossSchool.length > 0) {
        securityFailures.push(
          "SECURITY: Cross-School Access – un profesor de la Școala A a putut citi notele unui elev de la Școala B (Liceul Cucu); RLS ar fi trebuit să blocheze (school_id nu coincide)."
        );
      }
      expect(selectError).toBeNull();
      expect(Array.isArray(gradesCrossSchool)).toBe(true);
      expect((gradesCrossSchool ?? []).length).toBe(0);
    }, 15_000);
  });
});

describe.skipIf(!shouldRun)("Security report", () => {
  it("reports any test that passed when it should have been blocked", () => {
    if (securityFailures.length > 0) {
      // eslint-disable-next-line no-console
      console.error("\n[SECURITATE] Teste care au trecut dar ar fi trebuit blocate:\n");
      securityFailures.forEach((msg) => console.error(`  - ${msg}`));
      expect(securityFailures).toHaveLength(0);
    }
  });
});
