# Verificare reguli SQL - Autoritatea bazei de date

Acest document descrie regulile implementate la nivel de DB și cum să le verifici.

## 1. Medii calculate în SQL (nu în frontend)

- **view_student_subject_average**: medie pe materie per elev
- **view_student_general_average**: media generală per elev
- **recalc_student_averages(student_id)**: returnează mediile calculate
- **get_subject_averages_for_students(student_ids[])**: batch pentru Grades/Reports
- **get_student_general_average_for_display(student_id)**: returnează media (din view sau snapshot)
- **get_class_stats_for_display(class_id, date_from, date_to)**: medii și absențe per elev
- **get_class_totals_for_display(class_id, date_from, date_to)**: media clasei, total absențe, total motivate

**Verificare**: Frontend (Grades.tsx, Reports.tsx) nu mai folosește `.reduce()` sau `map` pentru medii. Toate mediile vin din RPC-uri.

## 2. Snapshot la închiderea anului

- **academic_year**: tabel cu year_closed
- **academic_year_snapshots**: date congelate la închidere
- **close_academic_year(year_id)**: tranzacție atomică (recalc, copiază, setează closed, audit)

**Verificare**:
```sql
SELECT * FROM academic_year;
SELECT close_academic_year('<year_id>');
-- După close: year_closed = true, snapshot-urile populate
```

## 3. Blocare modificări după year_closed

Trigger-e BEFORE UPDATE/DELETE/INSERT pe:
- **grades**: refuză dacă `is_year_closed_for_student(student_id)`
- **attendance**: idem
- **disciplinary_actions**: idem

**Verificare**:
```sql
-- După close_academic_year, încearcă:
UPDATE grades SET grade = 9 WHERE student_id = '...';
-- Eroare: "Cannot modify grades: academic year is closed"
```

## 4. Audit DB (imposibil de ocolit)

Trigger-e AFTER INSERT/UPDATE/DELETE pe:
- grades, attendance, teacher_register (existau)
- disciplinary_actions, academic_year (noi)

Salvează: auth.uid(), OLD, NEW, server_ts în audit_logs.

**Verificare**:
```sql
INSERT INTO grades (...) VALUES (...);
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;
```

## 5. RLS strict pentru părinți

- **grades**: SELECT doar dacă student_id IN (parent_student_relations WHERE parent_user_id = auth.uid())
- **attendance**: idem
- **academic_year_snapshots**: idem

**Verificare**: Autentifică ca părinte, încearcă SELECT pe grades pentru un elev care nu e copilul lui → 0 rânduri (RLS).

## 6. Constrângere note: CHECK (1–10)

```sql
ALTER TABLE grades ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);
```

**Verificare**:
```sql
INSERT INTO grades (..., grade) VALUES (..., 0);   -- Eroare
INSERT INTO grades (..., grade) VALUES (..., 11);  -- Eroare
```

## 7. Model absențe: pending / motivated / unexcused / present

- status: CHECK IN ('present', 'pending', 'motivated', 'unexcused')
- validated_by, validated_at: setate de diriginte când status = motivated
- Profesor: poate INSERT, NU poate modifica status
- Diriginte: poate seta status la motivated

**Verificare**: Trigger restrict_teacher_attendance_status_update.

## 8. Condică profesor: limită temporală 2h

Trigger pe teacher_register INSERT: refuză dacă momentul inserării depășește cu > 2h ora programată (timetable_entries.start_time + register_date).

**Verificare**: Încearcă INSERT în teacher_register cu register_date cu > 2h în urmă → Eroare.

---

## Aplicare migrații

```bash
supabase db push
# sau
supabase migration up
```

## Regenerare tipuri TypeScript

```bash
supabase gen types typescript --local > src/integrations/supabase/types.ts
```
