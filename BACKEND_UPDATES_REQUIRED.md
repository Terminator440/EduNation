# Backend Files Requiring Updates After Multi-Tenant RLS Refactor

## Overview
After implementing the multi-tenant RLS refactor migration (`20260224000000_multi_tenant_rls_refactor.sql`), the following backend files may need updates to work correctly with the new schema and RLS policies.

## Critical Changes Summary

1. **New Table**: `teacher_assignments` - Teachers must be assigned via this table to add grades
2. **Function**: `get_my_school_id()` - Use this instead of `get_user_school_id()` for consistency
3. **RLS Enforcement**: All queries must respect `school_id` filtering
4. **Semester Lock**: Grades cannot be inserted/updated if semester is locked
5. **Schema Changes**: `profiles.role` column added (alongside `active_role`)

## Files Requiring Updates

### 1. Grade Management Files

#### `src/pages/Grades.tsx`
**Changes Needed:**
- Ensure all grade INSERT/UPDATE operations check for `teacher_assignments` entry
- Add validation to check if semester is locked before allowing grade modifications
- Ensure `school_id` is included in all grade queries

**Example Update:**
```typescript
// Before inserting/updating a grade, verify teacher assignment exists
const { data: assignment } = await supabase
  .from('teacher_assignments')
  .select('id')
  .eq('teacher_id', userId)
  .eq('class_id', classId)
  .eq('subject_id', subjectId)
  .eq('school_id', schoolId)
  .maybeSingle();

if (!assignment) {
  throw new Error('Nu aveți permisiunea de a adăuga note pentru această materie/clasă');
}

// Check semester lock
const { data: semester } = await supabase
  .from('semesters')
  .select('is_locked')
  .eq('school_id', schoolId)
  .eq('academic_year', academicYear)
  .eq('semester', semesterNumber)
  .maybeSingle();

if (semester?.is_locked) {
  throw new Error('Semestrul este blocat. Nu puteți modifica notele.');
}
```

#### `src/pages/TeacherDashboard.tsx`
**Changes Needed:**
- Update grade insertion logic to verify `teacher_assignments`
- Add semester lock checks
- Ensure all queries filter by `school_id`

#### `src/pages/HomeroomDashboard.tsx`
**Changes Needed:**
- Similar updates as TeacherDashboard
- Ensure homeroom teachers can only access their assigned classes

### 2. Student Management Files

#### `src/pages/DirectorDashboard.tsx`
**Changes Needed:**
- Ensure all student queries include `school_id = get_my_school_id()` filter
- Update student creation to automatically set `school_id` from director's profile
- Verify RLS policies allow director access only to their school's students

**Example Update:**
```typescript
// Always filter by school_id
const { data: students } = await supabase
  .from('students')
  .select('*')
  .eq('school_id', schoolId) // Explicitly filter by school_id
  .eq('class_id', classId);
```

#### `src/pages/Reports.tsx`
**Changes Needed:**
- Ensure all report queries respect `school_id` filtering
- Update grade aggregation queries to work with new RLS policies

### 3. Teacher Assignment Management

#### New File: `src/pages/TeacherAssignments.tsx` (Recommended)
**Purpose:** Admin interface for managing teacher assignments

**Features Needed:**
- Create/update/delete `teacher_assignments` entries
- Link teachers to class-subject-semester combinations
- Validate that teacher belongs to the same school as class/subject

**Example Implementation:**
```typescript
// Create teacher assignment
const createTeacherAssignment = async (
  teacherId: string,
  classId: string,
  subjectId: string,
  semesterId: string | null,
  schoolId: string
) => {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .insert({
      teacher_id: teacherId,
      class_id: classId,
      subject_id: subjectId,
      semester_id: semesterId,
      school_id: schoolId
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
};
```

### 4. Profile Management Files

#### `src/pages/AdminDashboard.tsx`
**Changes Needed:**
- Update profile queries to use `role` column (new) or `active_role` (existing)
- Ensure profile updates respect `school_id` filtering
- Verify director can only update profiles from their school

**Example Update:**
```typescript
// Use role column for consistency
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, full_name, email, role, school_id')
  .eq('school_id', schoolId);
```

### 5. API/Service Files

#### `src/features/academics/queries.ts`
**Changes Needed:**
- Update all grade fetching functions to include `school_id` filter
- Add teacher assignment verification before grade operations
- Add semester lock checks

#### `src/integrations/supabase/types.ts`
**Changes Needed:**
- Regenerate types after migration to include:
  - `teacher_assignments` table
  - Updated `profiles.role` column
  - Updated constraints

**Command:**
```bash
npx supabase gen types typescript --local > src/integrations/supabase/types.ts
```

### 6. Utility Functions

#### New File: `src/utils/teacherAssignments.ts` (Recommended)
**Purpose:** Helper functions for teacher assignment operations

**Functions Needed:**
```typescript
// Check if teacher is assigned to teach subject in class
export async function isTeacherAssigned(
  teacherId: string,
  classId: string,
  subjectId: string,
  schoolId: string
): Promise<boolean>;

// Get all assignments for a teacher
export async function getTeacherAssignments(
  teacherId: string,
  schoolId: string
): Promise<TeacherAssignment[]>;

// Check if semester is locked
export async function isSemesterLocked(
  schoolId: string,
  academicYear: number,
  semester: number
): Promise<boolean>;
```

### 7. Hooks

#### `src/hooks/useAuditLog.ts`
**Changes Needed:**
- Ensure audit log queries respect `school_id` filtering
- Update to use `old_data` and `new_data` columns from `audit_logs` table

## Migration Checklist

### Before Deploying Migration:
- [ ] Backup database
- [ ] Review all existing `teacher_assignments` data (if migrating from `class_subjects`)
- [ ] Ensure all users have valid `school_id` in profiles
- [ ] Verify all students have `school_id` set

### After Deploying Migration:
- [ ] Run migration: `supabase migration up`
- [ ] Regenerate TypeScript types
- [ ] Populate `teacher_assignments` table from existing `class_subjects` or `subjects` data
- [ ] Test grade insertion/update with teacher assignments
- [ ] Test semester lock functionality
- [ ] Verify RLS policies work correctly for all roles
- [ ] Update frontend components listed above

## Data Migration Script

If migrating from `class_subjects` to `teacher_assignments`, run this SQL:

```sql
-- Migrate existing class_subjects to teacher_assignments
INSERT INTO public.teacher_assignments (teacher_id, class_id, subject_id, school_id)
SELECT DISTINCT teacher_id, class_id, subject_id, school_id
FROM public.class_subjects
WHERE teacher_id IS NOT NULL
  AND class_id IS NOT NULL
  AND subject_id IS NOT NULL
  AND school_id IS NOT NULL
ON CONFLICT (teacher_id, class_id, subject_id, semester_id) DO NOTHING;
```

## Testing Checklist

- [ ] Director can only see students/classes/grades from their school
- [ ] Teachers can only add grades if they have `teacher_assignments` entry
- [ ] Teachers cannot add grades if semester is locked
- [ ] Directors/secretariat can add grades even if semester is locked (for corrections)
- [ ] All queries include proper `school_id` filtering
- [ ] Audit logs capture `old_data` and `new_data` correctly

## Notes

1. **Backward Compatibility**: The migration maintains backward compatibility with `class_subjects` table - RLS policies check both `teacher_assignments` and `class_subjects`.

2. **Semester Lock**: The `is_semester_locked_for_grade()` function automatically determines the semester from the grade date, so you don't need to pass semester_id when checking locks.

3. **Performance**: All foreign key columns are indexed for optimal query performance.

4. **Security**: All RLS policies use `get_my_school_id()` which uses `SECURITY DEFINER` to ensure proper school isolation.
